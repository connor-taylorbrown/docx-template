import { describe, it, expect } from "vitest";
import { ReferenceMap, TypeHint, resolveHint, analyse } from "../src/template/analyse.js";
import { Resolver, TypedElement } from "../src/template/resolve.js";
import { parse } from "../src/template/expression.js";
import type { Element } from "../src/template/parser.js";
import type { Tag } from "../src/template/tag.js";
import type { DocumentNode } from "../src/template/document-node.js";

const str: TypeHint = { strong: false, type: { kind: "string" } };
const num: TypeHint = { strong: true, type: { kind: "number" } };

const resolver = new Resolver({ lookup: () => null });

function resolve(expr: string): TypedElement {
  return resolver.resolve(parse(expr));
}

describe("resolveHint", () => {
  describe("leaves", () => {
    it("binds with weak hint", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("x"), str, refs);
      expect(refs.get("x")!.strong).toBe(false);
      expect(refs.get("x")!.type.kind).toBe("string");
    });

    it("binds with strong hint", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("x"), num, refs);
      expect(refs.get("x")!.strong).toBe(true);
      expect(refs.get("x")!.type.kind).toBe("number");
    });
  });

  describe("arithmetic", () => {
    it("ADD propagates parent hint", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a + b"), str, refs);
      expect(refs.get("a")!.type.kind).toBe("string");
      expect(refs.get("b")!.type.kind).toBe("string");
    });

    it("ADD propagates strong hint", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a + b"), num, refs);
      expect(refs.get("a")!.strong).toBe(true);
      expect(refs.get("b")!.strong).toBe(true);
      expect(refs.get("a")!.type.kind).toBe("number");
    });

    it("SUB forces number", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a - b"), str, refs);
      expect(refs.get("a")!.strong).toBe(true);
      expect(refs.get("a")!.type.kind).toBe("number");
      expect(refs.get("b")!.strong).toBe(true);
      expect(refs.get("b")!.type.kind).toBe("number");
    });

    it("MUL left integer, right from parent", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a * b"), str, refs);
      expect(refs.get("a")!.type).toEqual({ kind: "number", integer: true });
      expect(refs.get("b")!.type.kind).toBe("string");
    });

    it("DIV forces number", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a / b"), str, refs);
      expect(refs.get("a")!.strong).toBe(true);
      expect(refs.get("a")!.type.kind).toBe("number");
      expect(refs.get("b")!.strong).toBe(true);
    });

    it("NEG forces number", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("-a"), str, refs);
      expect(refs.get("a")!.strong).toBe(true);
      expect(refs.get("a")!.type.kind).toBe("number");
    });
  });

  describe("logic", () => {
    it("NOT gives weak boolean", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("not a"), str, refs);
      expect(refs.get("a")!.strong).toBe(false);
      expect(refs.get("a")!.type.kind).toBe("boolean");
    });

    it("AND gives weak boolean to both", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a and b"), str, refs);
      expect(refs.get("a")!.type.kind).toBe("boolean");
      expect(refs.get("b")!.type.kind).toBe("boolean");
      expect(refs.get("a")!.strong).toBe(false);
    });

    it("OR gives weak boolean to both", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a or b"), str, refs);
      expect(refs.get("a")!.type.kind).toBe("boolean");
      expect(refs.get("b")!.type.kind).toBe("boolean");
    });
  });

  describe("comparison", () => {
    it("LT forces number", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a < b"), str, refs);
      expect(refs.get("a")!.strong).toBe(true);
      expect(refs.get("a")!.type.kind).toBe("number");
      expect(refs.get("b")!.type.kind).toBe("number");
    });

    it("EQ gives weak identity from parent", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a = b"), str, refs);
      expect(refs.get("a")!.strong).toBe(false);
      expect(refs.get("a")!.type.kind).toBe("string");
      expect(refs.get("b")!.type.kind).toBe("string");
    });

    it("NEQ gives weak identity from parent", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a != b"), num, refs);
      expect(refs.get("a")!.type.kind).toBe("number");
      expect(refs.get("a")!.strong).toBe(false);
    });

    it("IN gives strong collection to RHS", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a in b"), str, refs);
      expect(refs.get("b")!.strong).toBe(true);
      expect(refs.get("b")!.type.kind).toBe("collection");
    });
  });

  describe("DOT", () => {
    it("gives structure hint to left operand", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a.b"), str, refs);
      expect(refs.get("a")!.strong).toBe(true);
      expect(refs.get("a")!.type.kind).toBe("structure");
      const props = (refs.get("a")!.type as { kind: "structure"; properties: Map<string, TypeHint> }).properties;
      expect(props.get("b")).toEqual(str);
    });

    it("nested DOT chains structure hints", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a.b.c"), str, refs);
      const aType = refs.get("a")!.type as { kind: "structure"; properties: Map<string, TypeHint> };
      expect(aType.kind).toBe("structure");
      const bHint = aType.properties.get("b")!;
      expect(bHint.type.kind).toBe("structure");
      const bProps = (bHint.type as { kind: "structure"; properties: Map<string, TypeHint> }).properties;
      expect(bProps.get("c")).toEqual(str);
    });

    it("DOT in arithmetic context", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a.b + 1"), str, refs);
      const props = (refs.get("a")!.type as { kind: "structure"; properties: Map<string, TypeHint> }).properties;
      expect(props.get("b")).toEqual(str);
    });

    it("multiple DOT on same variable merges properties", () => {
      const refs = ReferenceMap.create();
      resolveHint(resolve("a.b"), str, refs);
      resolveHint(resolve("a.c"), num, refs);
      const props = (refs.get("a")!.type as { kind: "structure"; properties: Map<string, TypeHint> }).properties;
      expect(props.has("b")).toBe(true);
      expect(props.has("c")).toBe(true);
      expect(props.get("b")).toEqual(str);
      expect(props.get("c")).toEqual(num);
    });
  });
});

// --- analyse tests ---

const nullNode = null as unknown as DocumentNode;

function tag(head: string, params: string | null = null): Tag {
  return {
    offset: 0,
    length: 0,
    head,
    params,
    isKeyword: head.startsWith("#") || head.startsWith("/"),
  };
}

function el(t: Tag, children: Element[] = []): Element {
  return {
    tag: t,
    nodes: children.length ? [nullNode, nullNode] : [nullNode],
    children,
  };
}

type StructureType = { kind: "structure"; properties: Map<string, TypeHint> };
type CollectionType = { kind: "collection"; item?: TypeHint };

describe("analyse", () => {
  it("simple element binds weak string", () => {
    const refs = ReferenceMap.create();
    analyse(el(tag("name")), refs, resolver);
    expect(refs.get("name")!.strong).toBe(false);
    expect(refs.get("name")!.type.kind).toBe("string");
  });

  it("#if binds weak boolean", () => {
    const refs = ReferenceMap.create();
    analyse(el(tag("#if", "active"), [el(tag("x"))]), refs, resolver);
    expect(refs.get("active")!.strong).toBe(false);
    expect(refs.get("active")!.type.kind).toBe("boolean");
  });

  it("#each binds collection from item usage", () => {
    const refs = ReferenceMap.create();
    // {{#each item in items}}{{item.name}}{{/each}}
    analyse(
      el(tag("#each", "item in items"), [el(tag("item.name"))]),
      refs,
      resolver,
    );
    expect(refs.get("items")!.strong).toBe(true);
    expect(refs.get("items")!.type.kind).toBe("collection");
    const itemType = (refs.get("items")!.type as CollectionType).item;
    expect(itemType).toBeDefined();
    expect(itemType!.type.kind).toBe("structure");
    const props = (itemType!.type as StructureType).properties;
    expect(props.has("name")).toBe(true);
  });

  it("#each with expression collection: a + b", () => {
    const refs = ReferenceMap.create();
    // {{#each item in a + b}}{{item.name}}{{/each}}
    analyse(
      el(tag("#each", "item in a + b"), [el(tag("item.name"))]),
      refs,
      resolver,
    );
    // a + b in collection context: ADD propagates collection hint to both
    expect(refs.get("a")!.strong).toBe(true);
    expect(refs.get("a")!.type.kind).toBe("collection");
    expect(refs.get("b")!.strong).toBe(true);
    expect(refs.get("b")!.type.kind).toBe("collection");
  });

  it("#each scoped variable not visible outside", () => {
    const refs = ReferenceMap.create();
    analyse(
      el(tag("#each", "item in items"), [el(tag("item.name"))]),
      refs,
      resolver,
    );
    // "item" should not be in the context — only "items"
    // To verify, create a fresh ReferenceMap and check "item" was never written to context
    expect(refs.get("items")).toBeDefined();
    // "item" was only in the child scope, not context
    // We can verify by checking that binding "item" now creates a fresh entry
    const before = refs.get("item");
    expect(before).toBeUndefined();
  });

  it("#each shadows outer variable", () => {
    const refs = ReferenceMap.create();
    // Pre-bind "item" as a string in outer context
    refs.bind("item", str);
    const originalBinding = refs.get("item");

    // {{#each item in items}}{{item.name}}{{/each}}
    analyse(
      el(tag("#each", "item in items"), [el(tag("item.name"))]),
      refs,
      resolver,
    );

    // Outer "item" unchanged — still weak string
    expect(refs.get("item")).toBe(originalBinding);
    expect(refs.get("item")!.type.kind).toBe("string");
    expect(refs.get("item")!.strong).toBe(false);
  });

  it("#each missing in", () => {
    const refs = ReferenceMap.create();
    expect(() =>
      analyse(el(tag("#each", "items"), []), refs, resolver),
    ).toThrow("#each requires 'in' expression");
  });

  it("#each non-leaf declaration", () => {
    const refs = ReferenceMap.create();
    expect(() =>
      analyse(el(tag("#each", "a.b in items"), []), refs, resolver),
    ).toThrow("#each declaration must be a plain name");
  });

  it("nested #each propagates item types", () => {
    const refs = ReferenceMap.create();
    // {{#each i in x}}{{#each j in i.children}}{{j.name}}{{/each}}{{/each}}
    analyse(
      el(tag("#each", "i in x"), [
        el(tag("#each", "j in i.children"), [
          el(tag("j.name")),
        ]),
      ]),
      refs,
      resolver,
    );
    // x is a collection
    expect(refs.get("x")!.type.kind).toBe("collection");
    const xItem = (refs.get("x")!.type as CollectionType).item;
    expect(xItem).toBeDefined();
    // item type of x has property "children"
    expect(xItem!.type.kind).toBe("structure");
    const iProps = (xItem!.type as StructureType).properties;
    expect(iProps.has("children")).toBe(true);
    // children is itself a collection
    const childrenHint = iProps.get("children")!;
    expect(childrenHint.type.kind).toBe("collection");
    // whose items have property "name"
    const childItem = (childrenHint.type as CollectionType).item;
    expect(childItem).toBeDefined();
    expect(childItem!.type.kind).toBe("structure");
    const jProps = (childItem!.type as StructureType).properties;
    expect(jProps.has("name")).toBe(true);
  });
});
