import { describe, it, expect } from "vitest";
import { Tag } from "../src/template/tag.js";
import { Parser, Element } from "../src/template/parser.js";

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

describe("parser", () => {
  describe("root level", () => {
    it("empty input", () => {
      const parser = new Parser();
      expect(parser.parse()).toEqual([]);
    });

    it("single simple element", () => {
      const tag = simple("name");
      const parser = new Parser();
      const result = parser.addTag(tag);

      expect(result).not.toBeNull();
      expect(result!.tag).toBe(tag);
      expect(result!.children).toHaveLength(0);

      const elements = parser.parse();
      expect(elements).toHaveLength(1);
      expect(elements[0]).toBe(result);
    });

    it("multiple entries at root", () => {
      const parser = new Parser();
      const r1 = parser.addTag(simple("x"));
      const r2 = parser.addTag(simple("y"));
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(r1);
      expect(result[1]).toBe(r2);
    });

    it("addCollection splices elements into current scope", () => {
      const e1: Element = { tag: simple("a"), children: [] };
      const e2: Element = { tag: simple("b"), children: [] };
      const parser = new Parser();
      parser.addCollection([e1, e2]);
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(e1);
      expect(result[1]).toBe(e2);
    });
  });

  describe("return values", () => {
    it("simple tag returns element", () => {
      const parser = new Parser();
      const result = parser.addTag(simple("name"));
      expect(result).not.toBeNull();
      expect(result!.tag.head).toBe("name");
    });

    it("start tag returns null", () => {
      const parser = new Parser();
      const result = parser.addTag(keyword("if"));
      expect(result).toBeNull();
      // clean up
      parser.addTag(end());
    });

    it("end tag returns completed element", () => {
      const parser = new Parser();
      parser.addTag(keyword("if"));
      const result = parser.addTag(end());
      expect(result).not.toBeNull();
      expect(result!.tag.head).toBe("#if");
    });

    it("null tag returns null", () => {
      const parser = new Parser();
      const result = parser.addTag(null);
      expect(result).toBeNull();
      expect(parser.parse()).toEqual([]);
    });
  });

  describe("block elements", () => {
    it("empty block", () => {
      const open = keyword("if");
      const parser = new Parser();
      parser.addTag(open);
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe(open);
      expect(result[0].children).toEqual([]);
    });

    it("block with simple element", () => {
      const inner = simple("name");
      const parser = new Parser();
      parser.addTag(keyword("if"));
      const innerEl = parser.addTag(inner);
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0]).toBe(innerEl);
      expect(result[0].children[0].tag).toBe(inner);
    });

    it("block with spliced elements", () => {
      const e1: Element = { tag: simple("a"), children: [] };
      const e2: Element = { tag: simple("b"), children: [] };
      const parser = new Parser();
      parser.addTag(keyword("if"));
      parser.addCollection([e1, e2]);
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children[0]).toBe(e1);
      expect(result[0].children[1]).toBe(e2);
    });
  });

  describe("nesting", () => {
    it("nested blocks", () => {
      const parser = new Parser();
      parser.addTag(keyword("if"));
      parser.addTag(keyword("each"));
      parser.addTag(end());
      const outerEl = parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(outerEl);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].tag.head).toBe("#each");
    });

    it("elements around nested block", () => {
      const before: Element = { tag: simple("x"), children: [] };
      const after: Element = { tag: simple("y"), children: [] };
      const parser = new Parser();
      parser.addTag(keyword("if"));
      parser.addCollection([before]);
      parser.addTag(keyword("each"));
      parser.addTag(end());
      parser.addCollection([after]);
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = result[0];
      expect(outer.children).toHaveLength(3);
      expect(outer.children[0]).toBe(before);
      expect(outer.children[1].tag.head).toBe("#each");
      expect(outer.children[2]).toBe(after);
    });
  });

  describe("error cases", () => {
    it("unmatched #end", () => {
      const parser = new Parser();
      expect(() => parser.addTag(end())).toThrow(SyntaxError);
    });

    it("unclosed block", () => {
      const parser = new Parser();
      parser.addTag(keyword("if"));
      expect(() => parser.parse()).toThrow(SyntaxError);
    });

    it("nested unclosed block", () => {
      const parser = new Parser();
      parser.addTag(keyword("if"));
      parser.addTag(keyword("each"));
      parser.addTag(end());
      expect(() => parser.parse()).toThrow(SyntaxError);
    });
  });

  describe("mixed sequences", () => {
    it("elements before and after block", () => {
      const el: Element = { tag: simple("z"), children: [] };
      const parser = new Parser();
      parser.addCollection([el]);
      parser.addTag(keyword("if"));
      parser.addTag(end());
      const afterEl = parser.addTag(simple("w"));
      const result = parser.parse();

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(el);
      expect(result[1].tag.head).toBe("#if");
      expect(result[2]).toBe(afterEl);
    });

    it("sibling blocks", () => {
      const parser = new Parser();
      parser.addTag(keyword("if"));
      parser.addTag(end());
      parser.addTag(keyword("each"));
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0].tag.head).toBe("#if");
      expect(result[1].tag.head).toBe("#each");
    });

    it("block with mixed children", () => {
      const parser = new Parser();
      parser.addTag(keyword("if"));
      const nameEl = parser.addTag(simple("name"));
      parser.addTag(keyword("each"));
      const itemEl = parser.addTag(simple("item"));
      parser.addTag(end());
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = result[0];
      expect(outer.children).toHaveLength(2);
      expect(outer.children[0]).toBe(nameEl);
      const inner = outer.children[1];
      expect(inner.tag.head).toBe("#each");
      expect(inner.children).toHaveLength(1);
      expect(inner.children[0]).toBe(itemEl);
    });
  });
});
