import { describe, it, expect } from "vitest";
import { ParagraphView } from "../src/template/paragraph-reader.js";
import { Run } from "../src/template/run.js";
import { TreeReader, TreeNode } from "../src/template/tree-reader.js";
import { VirtualNode } from "../src/template/virtual-node.js";
import { TestRun } from "./test-run.js";

/** Concrete ParagraphView backed by TestRuns. */
class TestParagraphView extends ParagraphView {
  private _runs: TestRun[];

  constructor(runs: TestRun[]) {
    super();
    this._runs = runs;
  }

  text(): string {
    return this._runs.map((r) => r.text).join("");
  }

  runs(): Run[] {
    return this._runs;
  }

  replaceChildren(runs: Run[]): void {
    this._runs = runs as TestRun[];
  }
}

/** Concrete TreeNode for testing. */
class TestTreeNode extends TreeNode {
  private _children: TestTreeNode[];
  private _isParagraph: boolean;
  private _text: string;
  private _view: TestParagraphView;

  constructor(opts: {
    children?: TestTreeNode[];
    text?: string;
    runs?: TestRun[];
  }) {
    super();
    if (opts.children) {
      this._children = opts.children;
      this._isParagraph = false;
      this._text = "";
      this._view = new TestParagraphView([]);
    } else {
      this._children = [];
      this._isParagraph = true;
      const runs = opts.runs ?? [new TestRun(opts.text ?? "")];
      this._text = runs.map((r) => r.text).join("");
      this._view = new TestParagraphView(runs);
    }
  }

  children(): TestTreeNode[] {
    return this._children;
  }

  isParagraph(): boolean {
    return this._isParagraph;
  }

  text(): string {
    return this._text;
  }

  paragraphView(): ParagraphView {
    return this._view;
  }
}

/** Shorthand: create a paragraph node. */
function para(text: string): TestTreeNode {
  return new TestTreeNode({ text });
}

/** Shorthand: create a paragraph node with explicit runs. */
function paraRuns(...runs: string[]): TestTreeNode {
  return new TestTreeNode({ runs: runs.map((t) => new TestRun(t)) });
}

/** Shorthand: create a container node. */
function container(...children: TestTreeNode[]): TestTreeNode {
  return new TestTreeNode({ children });
}

describe("TreeReader", () => {
  describe("classify returns VirtualNode", () => {
    it("root virtual node wraps the TreeNode", () => {
      const root = container(para("Hello"));
      const r = new TreeReader();
      const vnode = r.classify(root);

      expect(vnode).toBeInstanceOf(VirtualNode);
      expect(vnode.content).toBe(root);
      expect(vnode.tag).toBeNull();
      expect(vnode.element).toBeNull();
    });

    it("plain paragraph becomes a leaf child", () => {
      const p = para("Hello world");
      const root = container(p);
      const r = new TreeReader();
      const vnode = r.classify(root);

      expect(vnode.children).toHaveLength(1);
      // Paragraph with no tags — leaf VirtualNode from ParagraphReader
      const child = vnode.children[0];
      expect(child.content).toBe(p.paragraphView());
      expect(child.tag).toBeNull();
      expect(child.children).toHaveLength(0);
    });

    it("isolated tag paragraph", () => {
      const p = para("{{name}}");
      const root = container(p);
      const r = new TreeReader();
      const vnode = r.classify(root);

      expect(vnode.children).toHaveLength(1);
      const child = vnode.children[0];
      expect(child.content).toBe(p);
      expect(child.tag).not.toBeNull();
      expect(child.tag!.head).toBe("name");
      expect(child.element).not.toBeNull();
      expect(child.element!.tag.head).toBe("name");
    });

    it("inline tag paragraph delegates to ParagraphReader", () => {
      const root = container(para("Hello {{name}} world"));
      const r = new TreeReader();
      const vnode = r.classify(root);

      expect(vnode.children).toHaveLength(1);
      const paraNode = vnode.children[0];
      // ParagraphReader wraps paragraph: three children (text, tag, text)
      expect(paraNode.children).toHaveLength(3);
      expect(paraNode.children[1].tag!.head).toBe("name");
    });

    it("container recursion", () => {
      const inner = container(para("{{name}}"));
      const root = container(inner);
      const r = new TreeReader();
      const vnode = r.classify(root);

      expect(vnode.children).toHaveLength(1);
      const containerChild = vnode.children[0];
      expect(containerChild.content).toBe(inner);
      expect(containerChild.tag).toBeNull();
      expect(containerChild.children).toHaveLength(1);
      expect(containerChild.children[0].tag!.head).toBe("name");
    });
  });

  describe("result still validates", () => {
    it("simple tag", () => {
      const root = container(para("{{name}}"));
      const r = new TreeReader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expect(result[0].tag.head).toBe("name");
    });

    it("block structure", () => {
      const root = container(
        para("{{#if x}}"),
        para("Hello {{name}} world"),
        para("{{#end}}"),
      );
      const r = new TreeReader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expect(result[0].tag.head).toBe("#if");
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].tag.head).toBe("name");
    });

    it("nested blocks", () => {
      const root = container(
        para("{{#if x}}"),
        para("{{#each y}}"),
        para("{{#end}}"),
        para("{{#end}}"),
      );
      const r = new TreeReader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expect(result[0].tag.head).toBe("#if");
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].tag.head).toBe("#each");
    });

    it("inline tags split across runs", () => {
      const root = container(paraRuns("Hello {{na", "me}} world"));
      const r = new TreeReader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expect(result[0].tag.head).toBe("name");
    });
  });

  describe("errors", () => {
    it("unclosed block", () => {
      const root = container(para("{{#if x}}"), para("content"));
      const r = new TreeReader();
      r.classify(root);

      expect(() => r.result()).toThrow(SyntaxError);
    });

    it("unmatched end", () => {
      const root = container(para("{{#end}}"));
      const r = new TreeReader();

      expect(() => r.classify(root)).toThrow(SyntaxError);
    });
  });
});
