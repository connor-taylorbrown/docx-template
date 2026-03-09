import { describe, it, expect } from "vitest";
import { DocumentNode } from "../src/template/document-node.js";
import { Parser, Element, ContentElement, SimpleElement, BlockElement } from "../src/template/parser.js";
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
  return new TreeReader(new Parser<DocumentNode>(), parseInline);
}

function asContent(el: Element<DocumentNode>): ContentElement<DocumentNode> {
  expect(el.kind).toBe("content");
  return el as ContentElement<DocumentNode>;
}

function asSimple(el: Element<DocumentNode>): SimpleElement<DocumentNode> {
  expect(el.kind).toBe("simple");
  return el as SimpleElement<DocumentNode>;
}

function asBlock(el: Element<DocumentNode>): BlockElement<DocumentNode> {
  expect(el.kind).toBe("block");
  return el as BlockElement<DocumentNode>;
}

describe("TreeReader", () => {
  describe("plain content", () => {
    it("single paragraph, no tags", () => {
      const p = para("Hello world");
      const root = container(p);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const el = asContent(result[0]);
      expect(el.node).toBe(p);
      expect(el.elements).toEqual([]);
    });

    it("multiple plain paragraphs", () => {
      const p1 = para("Hello");
      const p2 = para("world");
      const root = container(p1, p2);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(2);
      expect(asContent(result[0]).node).toBe(p1);
      expect(asContent(result[1]).node).toBe(p2);
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
      const el = asSimple(result[0]);
      expect(el.node).toBe(p);
      expect(el.tag.head).toBe("name");
    });

    it("whitespace-padded tag is still isolated", () => {
      const p = para("  {{name}}  ");
      const root = container(p);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      asSimple(result[0]);
    });

    it("keyword tag is isolated", () => {
      const root = container(para("{{#if x}}"), para("{{#end}}"));
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.openTag.head).toBe("#if");
    });

    it("tag with surrounding text is not isolated", () => {
      const p = para("Hello {{name}} world");
      const root = container(p);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const content = asContent(result[0]);
      expect(content.node).toBe(p);
      expect(content.elements).toHaveLength(3);
      asContent(content.elements[0] as Element<DocumentNode>);
      asSimple(content.elements[1] as Element<DocumentNode>);
      asContent(content.elements[2] as Element<DocumentNode>);
    });
  });

  describe("block structure across paragraphs", () => {
    it("block with content paragraph", () => {
      const open = para("{{#if x}}");
      const body = para("Hello");
      const close = para("{{#end}}");
      const root = container(open, body, close);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.openNode).toBe(open);
      expect(block.closeNode).toBe(close);
      expect(block.openTag.head).toBe("#if");
      expect(block.children).toHaveLength(1);
      expect(asContent(block.children[0]).node).toBe(body);
    });

    it("empty block", () => {
      const open = para("{{#each items}}");
      const close = para("{{#end}}");
      const root = container(open, close);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.openTag.head).toBe("#each");
      expect(block.openTag.params).toBe("items");
      expect(block.children).toEqual([]);
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
      const outer = asBlock(result[0]);
      expect(outer.openTag.head).toBe("#if");
      expect(outer.children).toHaveLength(1);
      const inner = asBlock(outer.children[0]);
      expect(inner.openTag.head).toBe("#each");
      expect(inner.children).toHaveLength(1);
      asContent(inner.children[0]);
    });
  });

  describe("mixed isolated and inline", () => {
    it("block containing inline-parsed paragraph", () => {
      const open = para("{{#if x}}");
      const body = para("Hello {{name}} world");
      const close = para("{{#end}}");
      const root = container(open, body, close);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.children).toHaveLength(1);
      const content = asContent(block.children[0]);
      expect(content.node).toBe(body);
      expect(content.elements).toHaveLength(3);
      const inner = content.elements[1] as SimpleElement<DocumentNode>;
      expect(inner.tag.head).toBe("name");
    });

    it("inline tags split across runs", () => {
      const body = paraRuns("Hello {{na", "me}} world");
      const root = container(body);
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(1);
      const content = asContent(result[0]);
      expect(content.elements).toHaveLength(3);
      asContent(content.elements[0] as Element<DocumentNode>);
      asSimple(content.elements[1] as Element<DocumentNode>);
      asContent(content.elements[2] as Element<DocumentNode>);
    });
  });

  describe("recursive traversal", () => {
    it("nested containers", () => {
      const p1 = para("{{name}}");
      const p2 = para("Hello");
      const root = container(
        container(
          container(p1),
        ),
        container(p2),
      );
      const r = reader();
      r.classify(root);
      const result = r.result();

      expect(result).toHaveLength(2);
      asSimple(result[0]);
      expect(asContent(result[1]).node).toBe(p2);
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
