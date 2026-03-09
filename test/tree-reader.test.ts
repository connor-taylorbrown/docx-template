import { describe, it, expect } from "vitest";
import { Parser, Element } from "../src/template/parser.js";
import { ParagraphView, parseInline } from "../src/template/inline.js";
import { Run } from "../src/template/run.js";
import { TreeReader, TreeNode } from "../src/template/tree-reader.js";
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

function reader(): TreeReader {
  return new TreeReader(new Parser(), parseInline);
}

function expectSimple(el: Element): void {
  expect(el.nodes).toHaveLength(1);
  expect(el.children).toHaveLength(0);
}

function expectBlock(el: Element): void {
  expect(el.nodes).toHaveLength(2);
}

describe("TreeReader", () => {
  describe("plain content", () => {
    it("single paragraph, no tags — produces no elements", () => {
      const root = container(para("Hello world"));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(0);
    });

    it("multiple plain paragraphs — produces no elements", () => {
      const root = container(para("Hello"), para("world"));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(0);
    });
  });

  describe("isolated tags", () => {
    it("simple tag", () => {
      const p = para("{{name}}");
      const root = container(p);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectSimple(result[0]);
      expect(result[0].nodes[0]).toBe(p);
      expect(result[0].tag.head).toBe("name");
    });

    it("whitespace-padded tag is still isolated", () => {
      const root = container(para("  {{name}}  "));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectSimple(result[0]);
    });

    it("keyword tag is isolated", () => {
      const root = container(para("{{#if x}}"), para("{{#end}}"));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectBlock(result[0]);
      expect(result[0].tag.head).toBe("#if");
    });

    it("tag with surrounding text is not isolated — inline elements splice to scope", () => {
      const root = container(para("Hello {{name}} world"));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectSimple(result[0]);
    });
  });

  describe("block structure across paragraphs", () => {
    it("block with plain content paragraph — no children", () => {
      const open = para("{{#if x}}");
      const close = para("{{#end}}");
      const root = container(open, para("Hello"), close);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectBlock(result[0]);
      expect(result[0].nodes[0]).toBe(open);
      expect(result[0].nodes[1]).toBe(close);
      expect(result[0].tag.head).toBe("#if");
      expect(result[0].children).toEqual([]);
    });

    it("empty block", () => {
      const root = container(para("{{#each items}}"), para("{{#end}}"));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectBlock(result[0]);
      expect(result[0].tag.head).toBe("#each");
      expect(result[0].tag.params).toBe("items");
      expect(result[0].children).toEqual([]);
    });

    it("nested blocks", () => {
      const root = container(
        para("{{#if x}}"),
        para("{{#each y}}"),
        para("item"),
        para("{{#end}}"),
        para("{{#end}}"),
      );
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const outer = result[0];
      expectBlock(outer);
      expect(outer.tag.head).toBe("#if");
      expect(outer.children).toHaveLength(1);
      const inner = outer.children[0];
      expectBlock(inner);
      expect(inner.tag.head).toBe("#each");
      expect(inner.children).toEqual([]);
    });
  });

  describe("mixed isolated and inline", () => {
    it("block containing inline-parsed paragraph", () => {
      const open = para("{{#if x}}");
      const close = para("{{#end}}");
      const root = container(open, para("Hello {{name}} world"), close);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectBlock(result[0]);
      expect(result[0].children).toHaveLength(1);
      expectSimple(result[0].children[0]);
      expect(result[0].children[0].tag.head).toBe("name");
    });

    it("inline tags split across runs", () => {
      const root = container(paraRuns("Hello {{na", "me}} world"));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectSimple(result[0]);
    });
  });

  describe("recursive traversal", () => {
    it("nested containers", () => {
      const root = container(
        container(
          container(para("{{name}}")),
        ),
        container(para("Hello")),
      );
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      expectSimple(result[0]);
    });
  });

  describe("errors", () => {
    it("unclosed block", () => {
      const root = container(para("{{#if x}}"), para("content"));
      const r = reader();
      r.classify(root);

      expect(() => r.result()).toThrow(SyntaxError);
    });

    it("unmatched end", () => {
      const root = container(para("{{#end}}"));
      const r = reader();

      expect(() => r.classify(root)).toThrow(SyntaxError);
    });
  });
});
