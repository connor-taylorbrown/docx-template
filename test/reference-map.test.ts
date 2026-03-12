import { describe, it, expect } from "vitest";
import { ReferenceMap } from "../src/template/reference-map.js";
import type { TypeHint } from "../src/template/resolve.js";

const str: TypeHint = { strong: false, type: { kind: "string" } };
const num: TypeHint = { strong: true, type: { kind: "number" } };
const int: TypeHint = { strong: true, type: { kind: "number", integer: true } };
const bool: TypeHint = { strong: false, type: { kind: "boolean" } };

function struct(props: Record<string, TypeHint>, strong = true): TypeHint {
  return { strong, type: { kind: "structure", properties: new Map(Object.entries(props)) } };
}

function coll(item?: TypeHint): TypeHint {
  return { strong: true, type: { kind: "collection", item } };
}

describe("ReferenceMap", () => {
  it("binds and retrieves from context", () => {
    const refs = ReferenceMap.create();
    refs.bind("x", str);
    const binding = refs.get("x");
    expect(binding).toBeDefined();
    expect(binding!.type.kind).toBe("string");
  });

  it("scope falls through to context", () => {
    const refs = ReferenceMap.create();
    refs.bind("x", str);
    const child = refs.declare("item");
    expect(child.get("x")).toBe(refs.get("x"));
  });

  it("scoped writes stay in scope", () => {
    const refs = ReferenceMap.create();
    const child = refs.declare("item");
    child.bind("item", num);
    expect(refs.get("item")).toBeUndefined();
  });

  it("non-scoped writes go to context", () => {
    const refs = ReferenceMap.create();
    const child = refs.declare("item");
    child.bind("x", str);
    expect(refs.get("x")).toBeDefined();
    expect(refs.get("x")!.type.kind).toBe("string");
  });

  it("mutation propagates through scope copy", () => {
    const refs = ReferenceMap.create();
    refs.bind("x", str);
    const child = refs.declare("item");
    child.bind("x", num);
    expect(refs.get("x")!.strong).toBe(true);
    expect(refs.get("x")!.type.kind).toBe("number");
  });

  it("shadowing breaks link", () => {
    const refs = ReferenceMap.create();
    refs.bind("x", str);
    const original = refs.get("x");
    const child = refs.declare("x");
    child.bind("x", num);
    expect(refs.get("x")).toBe(original);
    expect(refs.get("x")!.type.kind).toBe("string");
  });

  it("nested scope sees outer scoped variable", () => {
    const refs = ReferenceMap.create();
    const c1 = refs.declare("a");
    const c2 = c1.declare("b");
    expect(c2.get("a")).toBe(c1.get("a"));
  });

  it("nested mutation reaches outer scope", () => {
    const refs = ReferenceMap.create();
    const c1 = refs.declare("a");
    const c2 = c1.declare("b");
    c2.bind("a", num);
    expect(c1.get("a")!.strong).toBe(true);
    expect(c1.get("a")!.type.kind).toBe("number");
  });

  it("strengthening replaces weak with strong", () => {
    const refs = ReferenceMap.create();
    refs.bind("x", str);
    expect(refs.get("x")!.strong).toBe(false);
    refs.bind("x", num);
    expect(refs.get("x")!.strong).toBe(true);
    expect(refs.get("x")!.type.kind).toBe("number");
  });

  it("weak after strong is no-op", () => {
    const refs = ReferenceMap.create();
    refs.bind("x", num);
    refs.bind("x", bool);
    expect(refs.get("x")!.strong).toBe(true);
    expect(refs.get("x")!.type.kind).toBe("number");
  });

  describe("assertCompatible", () => {
    it("strong number + strong number does not throw", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", num);
      expect(() => refs.bind("x", int)).not.toThrow();
    });

    it("strong collection + strong collection does not throw", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", coll());
      expect(() => refs.bind("x", coll(str))).not.toThrow();
    });

    it("strong structure + strong structure does not throw", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", struct({ a: str }));
      expect(() => refs.bind("x", struct({ b: num }))).not.toThrow();
    });

    it("strong number + strong collection throws", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", num);
      expect(() => refs.bind("x", coll())).toThrow();
    });

    it("strong structure + strong number throws", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", struct({ a: str }));
      expect(() => refs.bind("x", num)).toThrow();
    });

    it("strong collection + strong structure throws", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", coll());
      expect(() => refs.bind("x", struct({ a: str }))).toThrow();
    });
  });

  describe("merge", () => {
    it("strong structure + strong structure merges properties", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", struct({ a: str }));
      refs.bind("x", struct({ b: num }));
      const t = refs.get("x")!.type as { kind: "structure"; properties: Map<string, TypeHint> };
      expect(t.properties.has("a")).toBe(true);
      expect(t.properties.has("b")).toBe(true);
    });

    it("structure merge with overlapping property merges recursively", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", struct({ a: struct({ p: str }) }));
      refs.bind("x", struct({ a: struct({ q: num }) }));
      const t = refs.get("x")!.type as { kind: "structure"; properties: Map<string, TypeHint> };
      const aType = t.properties.get("a")!.type as { kind: "structure"; properties: Map<string, TypeHint> };
      expect(aType.properties.has("p")).toBe(true);
      expect(aType.properties.has("q")).toBe(true);
    });

    it("collection + collection merges item types", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", coll(struct({ a: str })));
      refs.bind("x", coll(struct({ b: num })));
      const t = refs.get("x")!.type as { kind: "collection"; item?: TypeHint };
      expect(t.item).toBeDefined();
      const itemType = t.item!.type as { kind: "structure"; properties: Map<string, TypeHint> };
      expect(itemType.properties.has("a")).toBe(true);
      expect(itemType.properties.has("b")).toBe(true);
    });

    it("number + integer keeps integer", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", num);
      refs.bind("x", int);
      const t = refs.get("x")!.type as { kind: "number"; integer?: boolean };
      expect(t.integer).toBe(true);
    });

    it("integer + number keeps integer", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", int);
      refs.bind("x", num);
      const t = refs.get("x")!.type as { kind: "number"; integer?: boolean };
      expect(t.integer).toBe(true);
    });

    it("weak + weak merges structure properties", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", struct({ a: str }, false));
      refs.bind("x", struct({ b: num }, false));
      const t = refs.get("x")!.type as { kind: "structure"; properties: Map<string, TypeHint> };
      expect(t.properties.has("a")).toBe(true);
      expect(t.properties.has("b")).toBe(true);
    });

    it("collection with no item + collection with item adds item", () => {
      const refs = ReferenceMap.create();
      refs.bind("x", coll());
      refs.bind("x", coll(str));
      const t = refs.get("x")!.type as { kind: "collection"; item?: TypeHint };
      expect(t.item).toBeDefined();
      expect(t.item!.type.kind).toBe("string");
    });
  });
});
