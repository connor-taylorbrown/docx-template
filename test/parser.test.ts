import { describe, it, expect } from "vitest";
import { Tag } from "../src/template/tag.js";
import { DocumentNode } from "../src/template/document-node.js";
import { Parser, Element } from "../src/template/parser.js";

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

/** Assert element has one node (simple). */
function expectSimple(el: Element): void {
  expect(el.nodes).toHaveLength(1);
  expect(el.children).toHaveLength(0);
}

/** Assert element has two nodes (block). */
function expectBlock(el: Element): void {
  expect(el.nodes).toHaveLength(2);
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
      expectSimple(result[0]);
      expect(result[0].nodes[0]).toBe(node);
      expect(result[0].tag).toBe(tag);
    });

    it("multiple entries at root", () => {
      const parser = new Parser();
      parser.addTag(new TestNode(), simple("x"));
      parser.addTag(new TestNode(), simple("y"));
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expectSimple(result[0]);
      expectSimple(result[1]);
    });

    it("addCollection splices elements into current scope", () => {
      const e1: Element = {
        tag: simple("a"),
        nodes: [new TestNode()],
        children: [],
      };
      const e2: Element = {
        tag: simple("b"),
        nodes: [new TestNode()],
        children: [],
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
      const openNode = new TestNode();
      const closeNode = new TestNode();
      const parser = new Parser();
      parser.addTag(openNode, open);
      parser.addTag(closeNode, end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expectBlock(result[0]);
      expect(result[0].tag).toBe(open);
      expect(result[0].nodes[0]).toBe(openNode);
      expect(result[0].nodes[1]).toBe(closeNode);
      expect(result[0].children).toEqual([]);
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
      expectBlock(result[0]);
      expect(result[0].children).toHaveLength(1);
      const child = result[0].children[0];
      expectSimple(child);
      expect(child.tag).toBe(inner);
      expect(child.nodes[0]).toBe(innerNode);
    });

    it("block with spliced elements", () => {
      const e1: Element = {
        tag: simple("a"),
        nodes: [new TestNode()],
        children: [],
      };
      const e2: Element = {
        tag: simple("b"),
        nodes: [new TestNode()],
        children: [],
      };
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addCollection([e1, e2]);
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(1);
      expectBlock(result[0]);
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children[0]).toBe(e1);
      expect(result[0].children[1]).toBe(e2);
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
      const outer = result[0];
      expectBlock(outer);
      expect(outer.nodes[0]).toBe(outerOpen);
      expect(outer.children).toHaveLength(1);
      const inner = outer.children[0];
      expectBlock(inner);
      expect(inner.nodes[0]).toBe(innerOpen);
      expect(inner.children).toEqual([]);
    });

    it("elements around nested block", () => {
      const before: Element = {
        tag: simple("x"),
        nodes: [new TestNode()],
        children: [],
      };
      const after: Element = {
        tag: simple("y"),
        nodes: [new TestNode()],
        children: [],
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
      const outer = result[0];
      expectBlock(outer);
      expect(outer.children).toHaveLength(3);
      expect(outer.children[0]).toBe(before);
      expect(outer.children[1].nodes[0]).toBe(innerOpen);
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
      const el: Element = {
        tag: simple("z"),
        nodes: [new TestNode()],
        children: [],
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
      expect(result[1].nodes[0]).toBe(openNode);
      expect(result[2].nodes[0]).toBe(afterNode);
    });

    it("sibling blocks", () => {
      const parser = new Parser();
      parser.addTag(new TestNode(), keyword("if"));
      parser.addTag(new TestNode(), end());
      parser.addTag(new TestNode(), keyword("each"));
      parser.addTag(new TestNode(), end());
      const result = parser.parse();

      expect(result).toHaveLength(2);
      expectBlock(result[0]);
      expectBlock(result[1]);
      expect(result[0].tag.head).toBe("#if");
      expect(result[1].tag.head).toBe("#each");
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
      const outer = result[0];
      expectBlock(outer);
      expect(outer.children).toHaveLength(2);
      expect(outer.children[0].nodes[0]).toBe(elemNode);
      const inner = outer.children[1];
      expectBlock(inner);
      expect(inner.children).toHaveLength(1);
      expect(inner.children[0].nodes[0]).toBe(innerElemNode);
    });
  });
});
