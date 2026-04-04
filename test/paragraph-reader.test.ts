import { describe, it, expect } from "vitest";
import { Run, ParagraphView } from "../src/template/document.js";
import { ParagraphReader } from "../src/template/paragraph-reader.js";
import { TestRun } from "./test-run.js";

/** Concrete ParagraphView backed by TestRuns. */
class TestParagraph extends ParagraphView {
  private _runs: TestRun[];

  constructor(runs: TestRun[]) {
    super();
    this._runs = runs;
  }

  text(): string {
    return this._runs.map((r) => r.text()).join("");
  }

  tagName(): string | null {
    return "p";
  }

  runs(): Run[] {
    return this._runs;
  }

  replaceChildren(runs: Run[]): void {
    this._runs = runs as TestRun[];
  }
}

describe("ParagraphReader", () => {
  describe("no tags", () => {
    it("returns a leaf virtual node", () => {
      const view = new TestParagraph([new TestRun("Hello world")]);
      const reader = new ParagraphReader();
      const vnode = reader.classify(view);

      expect(vnode.content).toBe(view);
      expect(vnode.element).toBeNull();
      expect(vnode.children).toHaveLength(0);
    });

    it("validates cleanly", () => {
      const view = new TestParagraph([new TestRun("Hello world")]);
      const reader = new ParagraphReader();
      reader.classify(view);

      expect(reader.result()).toEqual([]);
    });
  });

  describe("simple tags", () => {
    it("single tag — one child with element", () => {
      const view = new TestParagraph([new TestRun("{{name}}")]);
      const reader = new ParagraphReader();
      const vnode = reader.classify(view);

      expect(vnode.content).toBe(view);
      expect(vnode.children).toHaveLength(1);

      const child = vnode.children[0];
      expect(child.element).not.toBeNull();
      expect(child.element!.expression.text!).toBe("name");
      expect(child.children).toHaveLength(0);
    });

    it("tag with surrounding text — three children", () => {
      const view = new TestParagraph([new TestRun("Hello {{name}} world")]);
      const reader = new ParagraphReader();
      const vnode = reader.classify(view);

      expect(vnode.children).toHaveLength(3);

      // "Hello " — no tag
      expect(vnode.children[0].element).toBeNull();

      // "{{name}}" — tagged
      expect(vnode.children[1].element).not.toBeNull();
      expect(vnode.children[1].element!.expression.text!).toBe("name");

      // " world" — no tag
      expect(vnode.children[2].element).toBeNull();
    });

    it("child content is the normalised Run", () => {
      const view = new TestParagraph([new TestRun("{{name}}")]);
      const reader = new ParagraphReader();
      const vnode = reader.classify(view);

      const child = vnode.children[0];
      expect(child.content).toBeInstanceOf(TestRun);
    });
  });

  describe("block tags", () => {
    it("start tag child has null element", () => {
      const view = new TestParagraph([
        new TestRun("{{#if x}}hello{{#end}}"),
      ]);
      const reader = new ParagraphReader();
      const vnode = reader.classify(view);

      // Start tag: element is null, has a parser ID
      expect(vnode.children[0].element).toBeNull();
      expect(vnode.children[0].id).toBeGreaterThanOrEqual(0);

      // End tag: element is the completed block
      const endChild = vnode.children[vnode.children.length - 1];
      expect(endChild.element).not.toBeNull();
      expect(endChild.element!.keyword).toBe("#if");
    });

    it("result validates block structure", () => {
      const view = new TestParagraph([
        new TestRun("{{#if x}}hello{{#end}}"),
      ]);
      const reader = new ParagraphReader();
      reader.classify(view);
      const elements = reader.result();

      expect(elements).toHaveLength(1);
      expect(elements[0].keyword).toBe("#if");
    });
  });

  describe("parent references", () => {
    it("children have parent set", () => {
      const view = new TestParagraph([new TestRun("Hello {{name}} world")]);
      const reader = new ParagraphReader();
      const vnode = reader.classify(view);

      for (const child of vnode.children) {
        expect(child.parent).toBe(vnode);
      }
    });

    it("leaf node has null parent", () => {
      const view = new TestParagraph([new TestRun("Hello world")]);
      const reader = new ParagraphReader();
      const vnode = reader.classify(view);

      expect(vnode.parent).toBeNull();
    });
  });

  describe("errors", () => {
    it("unclosed block throws on result", () => {
      const view = new TestParagraph([new TestRun("{{#if x}}{{name}}")]);
      const reader = new ParagraphReader();
      reader.classify(view);

      expect(() => reader.result()).toThrow(SyntaxError);
    });
  });
});
