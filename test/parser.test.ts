import { describe, it, expect } from "vitest";
import { Tag } from "../src/template/tag.js";
import {
  Parser,
  Element,
  ContentElement,
  SimpleElement,
  BlockElement,
} from "../src/template/parser.js";

/** Helper: build a non-keyword tag. */
function simple(head: string): Tag {
  return { offset: 0, length: 0, head, params: null, isKeyword: false };
}

/** Helper: build a keyword tag. */
function keyword(head: string): Tag {
  return {
    offset: 0,
    length: 0,
    head: `#${head}`,
    params: null,
    isKeyword: true,
  };
}

/** Helper: build an #end tag. */
function end(): Tag {
  return { offset: 0, length: 0, head: "#end", params: null, isKeyword: true };
}

/** Type guard helpers for concise assertions. */
function asContent(el: Element<string>): ContentElement<string> {
  expect(el.kind).toBe("content");
  return el as ContentElement<string>;
}

function asSimple(el: Element<string>): SimpleElement<string> {
  expect(el.kind).toBe("simple");
  return el as SimpleElement<string>;
}

function asBlock(el: Element<string>): BlockElement<string> {
  expect(el.kind).toBe("block");
  return el as BlockElement<string>;
}

describe("parser", () => {
  describe("root level", () => {
    it("empty input", () => {
      const parser = new Parser<string>();
      expect(parser.parse()).toEqual([]);
    });

    it("single content node", () => {
      const parser = new Parser<string>();
      parser.addCollection("a", []);
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const el = asContent(result[0]);
      expect(el.node).toBe("a");
      expect(el.elements).toEqual([]);
    });

    it("single simple element", () => {
      const tag = simple("name");
      const parser = new Parser<string>();
      parser.addTag("a", tag);
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const el = asSimple(result[0]);
      expect(el.node).toBe("a");
      expect(el.tag).toBe(tag);
    });

    it("multiple entries at root", () => {
      const tag = simple("x");
      const parser = new Parser<string>();
      parser.addTag("a", tag);
      parser.addCollection("b", []);
      parser.addTag("c", simple("y"));
      const result = parser.parse();

      expect(result).toHaveLength(3);
      expect(result[0].kind).toBe("simple");
      expect(result[1].kind).toBe("content");
      expect(result[2].kind).toBe("simple");
    });
  });

  describe("block elements", () => {
    it("empty block", () => {
      const open = keyword("if");
      const close = end();
      const parser = new Parser<string>();
      parser.addTag("open", open);
      parser.addTag("close", close);
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const el = asBlock(result[0]);
      expect(el.openTag).toBe(open);
      expect(el.closeTag).toBe(close);
      expect(el.openNode).toBe("open");
      expect(el.closeNode).toBe("close");
      expect(el.children).toEqual([]);
    });

    it("block with content", () => {
      const parser = new Parser<string>();
      parser.addTag("open", keyword("if"));
      parser.addCollection("body", []);
      parser.addTag("close", end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.children).toHaveLength(1);
      const child = asContent(block.children[0]);
      expect(child.node).toBe("body");
    });

    it("block with simple element", () => {
      const inner = simple("name");
      const parser = new Parser<string>();
      parser.addTag("open", keyword("if"));
      parser.addTag("inner", inner);
      parser.addTag("close", end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.children).toHaveLength(1);
      const child = asSimple(block.children[0]);
      expect(child.tag).toBe(inner);
      expect(child.node).toBe("inner");
    });

    it("block with pre-parsed elements", () => {
      const e1: SimpleElement<string> = {
        kind: "simple",
        tag: simple("a"),
        node: "e1",
      };
      const e2: SimpleElement<string> = {
        kind: "simple",
        tag: simple("b"),
        node: "e2",
      };
      const parser = new Parser<string>();
      parser.addTag("open", keyword("if"));
      parser.addCollection("para", [e1, e2]);
      parser.addTag("close", end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.children).toHaveLength(1);
      const child = asContent(block.children[0]);
      expect(child.node).toBe("para");
      expect(child.elements).toEqual([e1, e2]);
    });
  });

  describe("nesting", () => {
    it("nested blocks", () => {
      const parser = new Parser<string>();
      parser.addTag("outer-open", keyword("if"));
      parser.addTag("inner-open", keyword("each"));
      parser.addTag("inner-close", end());
      parser.addTag("outer-close", end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = asBlock(result[0]);
      expect(outer.openNode).toBe("outer-open");
      expect(outer.children).toHaveLength(1);
      const inner = asBlock(outer.children[0]);
      expect(inner.openNode).toBe("inner-open");
      expect(inner.children).toEqual([]);
    });

    it("content around nested block", () => {
      const parser = new Parser<string>();
      parser.addTag("outer-open", keyword("if"));
      parser.addCollection("before", []);
      parser.addTag("inner-open", keyword("each"));
      parser.addTag("inner-close", end());
      parser.addCollection("after", []);
      parser.addTag("outer-close", end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = asBlock(result[0]);
      expect(outer.children).toHaveLength(3);
      expect(asContent(outer.children[0]).node).toBe("before");
      expect(asBlock(outer.children[1]).openNode).toBe("inner-open");
      expect(asContent(outer.children[2]).node).toBe("after");
    });
  });

  describe("error cases", () => {
    it("unmatched #end", () => {
      const parser = new Parser<string>();
      expect(() => parser.addTag("x", end())).toThrow(SyntaxError);
    });

    it("unclosed block", () => {
      const parser = new Parser<string>();
      parser.addTag("open", keyword("if"));
      expect(() => parser.parse()).toThrow(SyntaxError);
    });

    it("nested unclosed block", () => {
      const parser = new Parser<string>();
      parser.addTag("outer", keyword("if"));
      parser.addTag("inner", keyword("each"));
      parser.addTag("inner-close", end());
      expect(() => parser.parse()).toThrow(SyntaxError);
    });
  });

  describe("mixed sequences", () => {
    it("content before and after block", () => {
      const parser = new Parser<string>();
      parser.addCollection("before", []);
      parser.addTag("open", keyword("if"));
      parser.addTag("close", end());
      parser.addCollection("after", []);
      const result = parser.parse();

      expect(result).toHaveLength(3);
      expect(asContent(result[0]).node).toBe("before");
      expect(asBlock(result[1]).openNode).toBe("open");
      expect(asContent(result[2]).node).toBe("after");
    });

    it("sibling blocks", () => {
      const parser = new Parser<string>();
      parser.addTag("a-open", keyword("if"));
      parser.addTag("a-close", end());
      parser.addTag("b-open", keyword("each"));
      parser.addTag("b-close", end());
      const result = parser.parse();

      expect(result).toHaveLength(2);
      const a = asBlock(result[0]);
      const b = asBlock(result[1]);
      expect(a.openTag.head).toBe("#if");
      expect(b.openTag.head).toBe("#each");
    });

    it("block with mixed children", () => {
      const parser = new Parser<string>();
      parser.addTag("outer-open", keyword("if"));
      parser.addCollection("text", []);
      parser.addTag("elem", simple("name"));
      parser.addTag("inner-open", keyword("each"));
      parser.addTag("inner-elem", simple("item"));
      parser.addTag("inner-close", end());
      parser.addTag("outer-close", end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = asBlock(result[0]);
      expect(outer.children).toHaveLength(3);
      expect(asContent(outer.children[0]).node).toBe("text");
      expect(asSimple(outer.children[1]).node).toBe("elem");
      const inner = asBlock(outer.children[2]);
      expect(inner.children).toHaveLength(1);
      expect(asSimple(inner.children[0]).node).toBe("inner-elem");
    });
  });
});
