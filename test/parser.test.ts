import { describe, it, expect } from "vitest";
import { Tag, Parser, Element } from "../src/template/parser.js";
import { parse } from "../src/template/expression.js";

/** Helper: build a non-keyword tag. */
function simple(head: string): Tag {
  return { offset: 0, length: 0, head, params: null, isKeyword: false, raw: `{{${head}}}` };
}

/** Helper: build a keyword tag. */
function keyword(head: string, params: string | null = null): Tag {
  return {
    offset: 0,
    length: 0,
    head: `#${head}`,
    params,
    isKeyword: true,
    raw: `{{#${head}${params ? " " + params : ""}}}`,
  };
}

/** Helper: build an #end tag. */
function end(): Tag {
  return { offset: 0, length: 0, head: "#end", params: null, isKeyword: true, raw: "{{#end}}" };
}

/** Helper: build an Element for addCollection tests. */
function el(text: string, children: Element[] = []): Element {
  return {
    id: -1,
    keyword: null,
    expression: parse(text),
    children,
  };
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
      const { element } = parser.addTag(tag);

      expect(element).not.toBeNull();
      expect(element!.keyword).toBeNull();
      expect(element!.expression.text!).toBe("name");
      expect(element!.children).toHaveLength(0);

      const elements = parser.parse();
      expect(elements).toHaveLength(1);
      expect(elements[0]).toBe(element);
    });

    it("multiple entries at root", () => {
      const parser = new Parser();
      const r1 = parser.addTag(simple("x")).element;
      const r2 = parser.addTag(simple("y")).element;
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(r1);
      expect(result[1]).toBe(r2);
    });

    it("addCollection splices elements into current scope", () => {
      const e1 = el("a");
      const e2 = el("b");
      const parser = new Parser();
      parser.addCollection([e1, e2]);
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(e1);
      expect(result[1]).toBe(e2);
    });
  });

  describe("IDs", () => {
    it("IDs increment monotonically", () => {
      const parser = new Parser();
      const r0 = parser.addTag(simple("a"));
      const r1 = parser.addTag(simple("b"));
      const r2 = parser.addTag(simple("c"));

      expect(r0.id).toBe(0);
      expect(r1.id).toBe(1);
      expect(r2.id).toBe(2);
    });

    it("null tag gets id -1 and does not consume a counter slot", () => {
      const parser = new Parser();
      const r0 = parser.addTag(simple("a"));
      const r1 = parser.addTag(null);
      const r2 = parser.addTag(simple("b"));

      expect(r0.id).toBe(0);
      expect(r1.id).toBe(-1);
      expect(r1.element).toBeNull();
      expect(r2.id).toBe(1);
    });

    it("start tag ID stored on element", () => {
      const parser = new Parser();
      const start = parser.addTag(keyword("if", "x"));
      const close = parser.addTag(end());

      expect(start.element).toBeNull();
      expect(close.element).not.toBeNull();
      expect(close.element!.id).toBe(start.id);
    });

    it("simple element ID is self-referencing", () => {
      const parser = new Parser();
      const { id, element } = parser.addTag(simple("x"));
      expect(element!.id).toBe(id);
    });
  });

  describe("return values", () => {
    it("simple tag returns element with null keyword", () => {
      const parser = new Parser();
      const { element } = parser.addTag(simple("name"));
      expect(element).not.toBeNull();
      expect(element!.keyword).toBeNull();
      expect(element!.expression.text!).toBe("name");
    });

    it("start tag returns null element", () => {
      const parser = new Parser();
      const { element } = parser.addTag(keyword("if", "x"));
      expect(element).toBeNull();
      // clean up
      parser.addTag(end());
    });

    it("end tag returns completed element", () => {
      const parser = new Parser();
      parser.addTag(keyword("if", "x"));
      const { element } = parser.addTag(end());
      expect(element).not.toBeNull();
      expect(element!.keyword).toBe("#if");
      expect(element!.expression.text!).toBe("x");
    });

    it("null tag returns null element", () => {
      const parser = new Parser();
      const { element } = parser.addTag(null);
      expect(element).toBeNull();
      expect(parser.parse()).toEqual([]);
    });
  });

  describe("block elements", () => {
    it("empty block", () => {
      const parser = new Parser();
      parser.addTag(keyword("if", "x"));
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expect(result[0].keyword).toBe("#if");
      expect(result[0].expression.text!).toBe("x");
      expect(result[0].children).toEqual([]);
    });

    it("block with simple element", () => {
      const inner = simple("name");
      const parser = new Parser();
      parser.addTag(keyword("if", "x"));
      const innerEl = parser.addTag(inner).element;
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0]).toBe(innerEl);
      expect(result[0].children[0].expression.text!).toBe("name");
    });

    it("block with spliced elements", () => {
      const e1 = el("a");
      const e2 = el("b");
      const parser = new Parser();
      parser.addTag(keyword("if", "x"));
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
      parser.addTag(keyword("if", "x"));
      parser.addTag(keyword("each", "y"));
      parser.addTag(end());
      const outerEl = parser.addTag(end()).element;
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(outerEl);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].keyword).toBe("#each");
    });

    it("elements around nested block", () => {
      const before = el("x");
      const after = el("y");
      const parser = new Parser();
      parser.addTag(keyword("if", "a"));
      parser.addCollection([before]);
      parser.addTag(keyword("each", "b"));
      parser.addTag(end());
      parser.addCollection([after]);
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = result[0];
      expect(outer.children).toHaveLength(3);
      expect(outer.children[0]).toBe(before);
      expect(outer.children[1].keyword).toBe("#each");
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
      parser.addTag(keyword("if", "x"));
      expect(() => parser.parse()).toThrow(SyntaxError);
    });

    it("nested unclosed block", () => {
      const parser = new Parser();
      parser.addTag(keyword("if", "x"));
      parser.addTag(keyword("each", "y"));
      parser.addTag(end());
      expect(() => parser.parse()).toThrow(SyntaxError);
    });
  });

  describe("mixed sequences", () => {
    it("elements before and after block", () => {
      const e = el("z");
      const parser = new Parser();
      parser.addCollection([e]);
      parser.addTag(keyword("if", "x"));
      parser.addTag(end());
      const afterEl = parser.addTag(simple("w")).element;
      const result = parser.parse();

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(e);
      expect(result[1].keyword).toBe("#if");
      expect(result[2]).toBe(afterEl);
    });

    it("sibling blocks", () => {
      const parser = new Parser();
      parser.addTag(keyword("if", "x"));
      parser.addTag(end());
      parser.addTag(keyword("each", "y"));
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0].keyword).toBe("#if");
      expect(result[1].keyword).toBe("#each");
    });

    it("block with mixed children", () => {
      const parser = new Parser();
      parser.addTag(keyword("if", "x"));
      const nameEl = parser.addTag(simple("name")).element;
      parser.addTag(keyword("each", "y"));
      const itemEl = parser.addTag(simple("item")).element;
      parser.addTag(end());
      parser.addTag(end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = result[0];
      expect(outer.children).toHaveLength(2);
      expect(outer.children[0]).toBe(nameEl);
      const inner = outer.children[1];
      expect(inner.keyword).toBe("#each");
      expect(inner.children).toHaveLength(1);
      expect(inner.children[0]).toBe(itemEl);
    });
  });

  describe("expression.text()", () => {
    it("simple element preserves expression text", () => {
      const parser = new Parser();
      const { element } = parser.addTag(simple("name"));
      expect(element!.expression.text!).toBe("name");
    });

    it("simple element with params preserves full text", () => {
      const tag: Tag = {
        offset: 0, length: 0, head: "fn", params: "x y",
        isKeyword: false, raw: "{{fn x y}}",
      };
      const parser = new Parser();
      const { element } = parser.addTag(tag);
      expect(element!.expression.text!).toBe("fn x y");
    });

    it("keyword element preserves params as expression text", () => {
      const parser = new Parser();
      parser.addTag(keyword("if", "a > b"));
      const { element } = parser.addTag(end());
      expect(element!.expression.text!).toBe("a > b");
    });
  });
});
