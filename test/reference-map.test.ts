import { describe, it, expect } from "vitest";
import { ReferenceMap } from "../src/template/reference-map.js";
import type { TypeHint } from "../src/template/resolve.js";

const str: TypeHint = { strong: false, type: { kind: "string" } };
const num: TypeHint = { strong: true, type: { kind: "number" } };
const bool: TypeHint = { strong: false, type: { kind: "boolean" } };

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
});
