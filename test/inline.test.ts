import { describe, it, expect } from "vitest";
import { Run } from "../src/template/run.js";
import {
  Element,
  SimpleElement,
  BlockElement,
} from "../src/template/parser.js";
import { ParagraphView, parseInline } from "../src/template/inline.js";
import { TestRun } from "./test-run.js";

/** Concrete ParagraphView backed by TestRuns. */
class TestParagraph extends ParagraphView {
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

  /** Helper: read current children as text for assertions. */
  childTexts(): string[] {
    return this._runs.map((r) => r.text);
  }
}

function asSimple(el: Element<Run>): SimpleElement<Run> {
  expect(el.kind).toBe("simple");
  return el as SimpleElement<Run>;
}

function asBlock(el: Element<Run>): BlockElement<Run> {
  expect(el.kind).toBe("block");
  return el as BlockElement<Run>;
}

describe("parseInline", () => {
  describe("early exit", () => {
    it("no tags", () => {
      const para = new TestParagraph([new TestRun("Hello world")]);
      const result = parseInline(para);
      expect(result).toEqual([]);
      expect(para.childTexts()).toEqual(["Hello world"]);
    });
  });

  describe("simple elements", () => {
    it("single simple tag, one run", () => {
      const para = new TestParagraph([new TestRun("{{name}}")]);
      const result = parseInline(para);

      expect(result).toHaveLength(1);
      asSimple(result[0]);
      expect(para.childTexts()).toEqual(["{{name}}"]);
    });

    it("simple tag with surrounding text", () => {
      const para = new TestParagraph([new TestRun("Hello {{name}} world")]);
      const result = parseInline(para);

      expect(result).toHaveLength(1);
      asSimple(result[0]);
      expect(para.childTexts()).toEqual(["Hello ", "{{name}}", " world"]);
    });
  });

  describe("block elements", () => {
    it("inline block", () => {
      const para = new TestParagraph([
        new TestRun("{{#if x}}hello{{#end}}"),
      ]);
      const result = parseInline(para);

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.openTag.head).toBe("#if");
      expect(block.children).toEqual([]);
    });

    it("empty inline block", () => {
      const para = new TestParagraph([new TestRun("{{#if x}}{{#end}}")]);
      const result = parseInline(para);

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.children).toEqual([]);
    });

    it("nested inline blocks", () => {
      const para = new TestParagraph([
        new TestRun("{{#if x}}{{#each y}}{{name}}{{#end}}{{#end}}"),
      ]);
      const result = parseInline(para);

      expect(result).toHaveLength(1);
      const outer = asBlock(result[0]);
      expect(outer.openTag.head).toBe("#if");
      expect(outer.children).toHaveLength(1);
      const inner = asBlock(outer.children[0]);
      expect(inner.openTag.head).toBe("#each");
      expect(inner.children).toHaveLength(1);
      asSimple(inner.children[0]);
    });
  });

  describe("cross-run tags", () => {
    it("tag split across two runs", () => {
      const para = new TestParagraph([
        new TestRun("Hello {{na"),
        new TestRun("me}}"),
      ]);
      const result = parseInline(para);

      expect(result).toHaveLength(1);
      asSimple(result[0]);
      expect(para.childTexts()).toEqual(["Hello ", "{{name}}"]);
    });

    it("tag split across three runs", () => {
      const para = new TestParagraph([
        new TestRun("{{n"),
        new TestRun("am"),
        new TestRun("e}}"),
      ]);
      const result = parseInline(para);

      expect(result).toHaveLength(1);
      asSimple(result[0]);
      expect(para.childTexts()).toEqual(["{{name}}"]);
    });
  });

  describe("mixed", () => {
    it("multiple tags, simple and block", () => {
      const para = new TestParagraph([
        new TestRun("{{a}}{{#if x}}{{b}}{{#end}}"),
      ]);
      const result = parseInline(para);

      expect(result).toHaveLength(2);
      const simple = asSimple(result[0]);
      expect(simple.tag.head).toBe("a");
      const block = asBlock(result[1]);
      expect(block.openTag.head).toBe("#if");
      expect(block.children).toHaveLength(1);
      asSimple(block.children[0]);
    });
  });

  describe("errors", () => {
    it("unclosed inline block", () => {
      const para = new TestParagraph([new TestRun("{{#if x}}{{name}}")]);
      expect(() => parseInline(para)).toThrow(SyntaxError);
    });
  });
});
