import { describe, it, expect } from "vitest";
import { Tag } from "../src/template/tag.js";
import { DocumentNode } from "../src/template/document-node.js";
import {
  Parser,
  Element,
  SimpleElement,
  BlockElement,
} from "../src/template/parser.js";

class TestNode extends DocumentNode {}

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
function asSimple(el: Element): SimpleElement {
  expect(el.kind).toBe("simple");
  return el as SimpleElement;
}

function asBlock(el: Element): BlockElement {
  expect(el.kind).toBe("block");
  return el as BlockElement;
}

describe("parser", () => {
  describe("root level", () => {
    it("empty input", () => {
      const parser = new Parser();
      expect(parser.parse()).toEqual([]);
    });

    it("single simple element", () => {
      const tag = simple("name");
      const node = new TestNode();
      const parser = new Parser();
      parser.addTag(node, tag);
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const el = asSimple(result[0]);
      expect(el.node).toBe(node);
      expect(el.tag).toBe(tag);
    });

    it("multiple entries at root", () => {
      const parser = new Parser();
      parser.addTag(new TestNode(), simple("x"));
      parser.addTag(new TestNode(), simple("y"));
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0].kind).toBe("simple");
      expect(result[1].kind).toBe("simple");
    });

    it("addCollection splices elements into current scope", () => {
      const e1: SimpleElement = {
        kind: "simple",
        tag: simple("a"),
        node: new TestNode(),
      };
      const e2: SimpleElement = {
        kind: "simple",
        tag: simple("b"),
        node: new TestNode(),
      };
      const parser = new Parser();
      parser.addCollection([e1, e2]);
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(e1);
      expect(result[1]).toBe(e2);
    });
  });

  describe("block elements", () => {
    it("empty block", () => {
      const open = keyword("if");
      const close = end();
      const openNode = new TestNode();
      const closeNode = new TestNode();
      const parser = new Parser();
      parser.addTag(openNode, open);
      parser.addTag(closeNode, close);
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const el = asBlock(result[0]);
      expect(el.openTag).toBe(open);
      expect(el.openNode).toBe(openNode);
      expect(el.closeNode).toBe(closeNode);
      expect(el.children).toEqual([]);
    });

    it("block with simple element", () => {
      const inner = simple("name");
      const innerNode = new TestNode();
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addTag(innerNode, inner);
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.children).toHaveLength(1);
      const child = asSimple(block.children[0]);
      expect(child.tag).toBe(inner);
      expect(child.node).toBe(innerNode);
    });

    it("block with spliced elements", () => {
      const e1: SimpleElement = {
        kind: "simple",
        tag: simple("a"),
        node: new TestNode(),
      };
      const e2: SimpleElement = {
        kind: "simple",
        tag: simple("b"),
        node: new TestNode(),
      };
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addCollection([e1, e2]);
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const block = asBlock(result[0]);
      expect(block.children).toHaveLength(2);
      expect(block.children[0]).toBe(e1);
      expect(block.children[1]).toBe(e2);
    });
  });

  describe("nesting", () => {
    it("nested blocks", () => {
      const outerOpen = new TestNode();
      const innerOpen = new TestNode();
      const parser = new Parser();
      parser.addTag(outerOpen, keyword("if"));
      parser.addTag(innerOpen, keyword("each"));
      parser.addTag(new TestNode(), end());
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = asBlock(result[0]);
      expect(outer.openNode).toBe(outerOpen);
      expect(outer.children).toHaveLength(1);
      const inner = asBlock(outer.children[0]);
      expect(inner.openNode).toBe(innerOpen);
      expect(inner.children).toEqual([]);
    });

    it("elements around nested block", () => {
      const before: SimpleElement = {
        kind: "simple",
        tag: simple("x"),
        node: new TestNode(),
      };
      const after: SimpleElement = {
        kind: "simple",
        tag: simple("y"),
        node: new TestNode(),
      };
      const innerOpen = new TestNode();
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addCollection([before]);
      parser.addTag(innerOpen, keyword("each"));
      parser.addTag(new TestNode(), end());
      parser.addCollection([after]);
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = asBlock(result[0]);
      expect(outer.children).toHaveLength(3);
      expect(outer.children[0]).toBe(before);
      expect(asBlock(outer.children[1]).openNode).toBe(innerOpen);
      expect(outer.children[2]).toBe(after);
    });
  });

  describe("error cases", () => {
    it("unmatched #end", () => {
      const parser = new Parser();
      expect(() => parser.addTag(new TestNode(), end())).toThrow(SyntaxError);
    });

    it("unclosed block", () => {
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      expect(() => parser.parse()).toThrow(SyntaxError);
    });

    it("nested unclosed block", () => {
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addTag(new TestNode(), keyword("each"));
      parser.addTag(new TestNode(), end());
      expect(() => parser.parse()).toThrow(SyntaxError);
    });
  });

  describe("mixed sequences", () => {
    it("elements before and after block", () => {
      const el: SimpleElement = {
        kind: "simple",
        tag: simple("z"),
        node: new TestNode(),
      };
      const openNode = new TestNode();
      const afterNode = new TestNode();
      const parser = new Parser();
      parser.addCollection([el]);
      parser.addTag(openNode, keyword("if"));
      parser.addTag(new TestNode(), end());
      parser.addTag(afterNode, simple("w"));
      const result = parser.parse();

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(el);
      expect(asBlock(result[1]).openNode).toBe(openNode);
      expect(asSimple(result[2]).node).toBe(afterNode);
    });

    it("sibling blocks", () => {
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addTag(new TestNode(), end());
      parser.addTag(new TestNode(), keyword("each"));
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(2);
      const a = asBlock(result[0]);
      const b = asBlock(result[1]);
      expect(a.openTag.head).toBe("#if");
      expect(b.openTag.head).toBe("#each");
    });

    it("block with mixed children", () => {
      const elemNode = new TestNode();
      const innerElemNode = new TestNode();
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addTag(elemNode, simple("name"));
      parser.addTag(new TestNode(), keyword("each"));
      parser.addTag(innerElemNode, simple("item"));
      parser.addTag(new TestNode(), end());
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      const outer = asBlock(result[0]);
      expect(outer.children).toHaveLength(2);
      expect(asSimple(outer.children[0]).node).toBe(elemNode);
      const inner = asBlock(outer.children[1]);
      expect(inner.children).toHaveLength(1);
      expect(asSimple(inner.children[0]).node).toBe(innerElemNode);
    });
  });
});
