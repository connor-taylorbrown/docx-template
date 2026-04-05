import { describe, it, expect, beforeEach } from "vitest";
import { ContentNode } from "../src/template/document.js";
import { VirtualNode } from "../src/template/virtual-node.js";
import { Element } from "../src/template/parser.js";
import { Tag } from "../src/template/tag.js";
import { parse } from "../src/template/expression.js";
import { SpanParser, prototype } from "../src/template/span-parser.js";
import { findBoundaries, hoist } from "../src/template/hoist.js";

// --- Helpers (mirrored from hoist.test.ts) ---

function tag(head: string, params: string | null = null): Tag {
  const raw = `{{${head}${params ? " " + params : ""}}}`;
  return { offset: 0, length: raw.length, head, params, isKeyword: head.startsWith("#"), raw };
}

function mkElement(t: Tag): Element {
  const keyword = t.isKeyword ? t.head : null;
  const text = t.isKeyword ? (t.params ?? "") : t.head;
  return { id: 0, keyword, expression: parse(text), children: [] };
}

let nextId = 0;

function resetIds(): void {
  nextId = 0;
}

function label(domTag: string): ContentNode {
  return { text: () => "", tagName: () => domTag };
}

const noContent: ContentNode = { text: () => "", tagName: () => null };

function container(domTag: string, ...children: VirtualNode[]): VirtualNode {
  return new VirtualNode({ content: label(domTag), id: -1, element: null, children });
}

function root(...children: VirtualNode[]): VirtualNode {
  return new VirtualNode({ content: noContent, id: -1, element: null, children });
}

function start(t: Tag, domTag = "p"): { node: VirtualNode; id: number } {
  const id = nextId++;
  const node = new VirtualNode({ content: label(domTag), id, element: null, children: [] });
  return { node, id };
}

function end(startId: number, t: Tag, domTag = "p"): VirtualNode {
  const id = nextId++;
  const element = mkElement(t);
  element.id = startId;
  return new VirtualNode({ content: label(domTag), id, element, children: [] });
}

function simple(t: Tag): VirtualNode {
  const id = nextId++;
  const element = mkElement(t);
  element.id = id;
  return new VirtualNode({ content: noContent, id, element, children: [] });
}

function plain(): VirtualNode {
  return new VirtualNode({ content: noContent, id: -1, element: null, children: [] });
}

beforeEach(() => {
  resetIds();
});

// --- Helpers for running SpanParser ---

function runSpanParser(input: VirtualNode[]): VirtualNode[] {
  const output: VirtualNode[] = [];
  const parser = new SpanParser(input);
  parser.write(output);
  return output;
}

// --- Collect all nodes in pre-order ---

function collect(node: VirtualNode): VirtualNode[] {
  const result: VirtualNode[] = [node];
  for (const child of node.children) {
    result.push(...collect(child));
  }
  return result;
}

describe("SpanParser", () => {
  describe("basic cases", () => {
    it("S1 — empty input", () => {
      const output = runSpanParser([]);
      expect(output).toEqual([]);
    });

    it("S2 — content nodes only", () => {
      const p1 = plain();
      const p2 = plain();
      const output = runSpanParser([p1, p2]);
      expect(output).toHaveLength(2);
      expect(output[0]).toBe(p1);
      expect(output[1]).toBe(p2);
    });

    it("S3 — simple element", () => {
      const s = simple(tag("name"));
      const output = runSpanParser([s]);
      expect(output).toHaveLength(1);
      expect(output[0]).toBe(s);
    });

    it("S4 — single block", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const p = plain();
      const e = end(s.id, ifTag);

      const output = runSpanParser([s.node, p, e]);

      expect(output).toHaveLength(1);
      const proto = output[0];
      expect(proto.content).toBeNull();
      expect(proto.element).not.toBeNull();
      expect(proto.element!.id).toBe(s.id);
      expect(proto.children).toHaveLength(1);
      expect(proto.children[0]).toBe(p);
    });

    it("S5 — block with no interior", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);

      const output = runSpanParser([s.node, e]);

      expect(output).toHaveLength(1);
      const proto = output[0];
      expect(proto.content).toBeNull();
      expect(proto.element).not.toBeNull();
      expect(proto.element!.id).toBe(s.id);
      expect(proto.children).toHaveLength(0);
    });

    it("S6 — adjacent blocks", () => {
      const ifTag = tag("#if", "x");
      const eachTag = tag("#each", "y");
      const s1 = start(ifTag);
      const e1 = end(s1.id, ifTag);
      const s2 = start(eachTag);
      const e2 = end(s2.id, eachTag);

      const output = runSpanParser([s1.node, e1, s2.node, e2]);

      expect(output).toHaveLength(2);
      expect(output[0].content).toBeNull();
      expect(output[0].element!.id).toBe(s1.id);
      expect(output[1].content).toBeNull();
      expect(output[1].element!.id).toBe(s2.id);
    });

    it("S7 — nested blocks", () => {
      const outerTag = tag("#if", "x");
      const innerTag = tag("#each", "y");
      const outerStart = start(outerTag);
      const innerStart = start(innerTag);
      const p = plain();
      const innerEnd = end(innerStart.id, innerTag);
      const outerEnd = end(outerStart.id, outerTag);

      const output = runSpanParser([
        outerStart.node, innerStart.node, p, innerEnd, outerEnd,
      ]);

      expect(output).toHaveLength(1);
      const outer = output[0];
      expect(outer.content).toBeNull();
      expect(outer.element!.id).toBe(outerStart.id);
      expect(outer.children).toHaveLength(1);

      const inner = outer.children[0];
      expect(inner.content).toBeNull();
      expect(inner.element!.id).toBe(innerStart.id);
      expect(inner.children).toHaveLength(1);
      expect(inner.children[0]).toBe(p);
    });

    it("S8 — mixed content and block", () => {
      const ifTag = tag("#if", "x");
      const nameTag = tag("name");
      const p1 = plain();
      const s = start(ifTag);
      const sim = simple(nameTag);
      const e = end(s.id, ifTag);
      const p2 = plain();

      const output = runSpanParser([p1, s.node, sim, e, p2]);

      expect(output).toHaveLength(3);
      expect(output[0]).toBe(p1);
      expect(output[1].content).toBeNull();
      expect(output[1].element!.id).toBe(s.id);
      expect(output[1].children).toHaveLength(1);
      expect(output[1].children[0]).toBe(sim);
      expect(output[2]).toBe(p2);
    });
  });

  describe("idempotence", () => {
    it("S9 — already-prototyped node passed through", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);

      // Build a prototype node manually (content: null, id === element.id)
      const protoNode = new VirtualNode({
        content: null,
        id: e.element!.id,
        element: e.element,
        children: [plain()],
      });

      const output = runSpanParser([protoNode]);
      expect(output).toHaveLength(1);
      expect(output[0]).toBe(protoNode);
    });

    it("S10 — double application produces identical output", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const p = plain();
      const e = end(s.id, ifTag);

      const first = runSpanParser([s.node, p, e]);
      const second = runSpanParser(first);

      expect(second).toHaveLength(first.length);
      expect(second[0]).toBe(first[0]);
    });
  });

  describe("errors", () => {
    it("S11 — unmatched start throws SyntaxError", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const p = plain();

      expect(() => runSpanParser([s.node, p])).toThrow(SyntaxError);
    });
  });
});

describe("prototype", () => {
  describe("tree integration", () => {
    it("T1 — flat block", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const p = plain();
      const e = end(s.id, ifTag);
      const r = root(s.node, p, e);

      prototype(r);

      expect(r.children).toHaveLength(1);
      expect(r.children[0].content).toBeNull();
      expect(r.children[0].element!.id).toBe(s.id);
      expect(r.children[0].children).toHaveLength(1);
      expect(r.children[0].children[0]).toBe(p);
    });

    it("T2 — block inside container", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const p = plain();
      const e = end(s.id, ifTag);
      const c = container("td", s.node, p, e);
      const r = root(c);

      prototype(r);

      // Root still has one child (the container)
      expect(r.children).toHaveLength(1);
      expect(r.children[0]).toBe(c);
      // Container's children are prototyped
      expect(c.children).toHaveLength(1);
      expect(c.children[0].content).toBeNull();
      expect(c.children[0].element!.id).toBe(s.id);
    });

    it("T3 — nested blocks at same level", () => {
      const outerTag = tag("#if", "x");
      const innerTag = tag("#each", "y");
      const outerStart = start(outerTag);
      const innerStart = start(innerTag);
      const p = plain();
      const innerEnd = end(innerStart.id, innerTag);
      const outerEnd = end(outerStart.id, outerTag);
      const r = root(outerStart.node, innerStart.node, p, innerEnd, outerEnd);

      prototype(r);

      expect(r.children).toHaveLength(1);
      const outer = r.children[0];
      expect(outer.content).toBeNull();
      expect(outer.children).toHaveLength(1);
      const inner = outer.children[0];
      expect(inner.content).toBeNull();
      expect(inner.children).toHaveLength(1);
      expect(inner.children[0]).toBe(p);
    });

    it("T4 — post-hoist block (full pipeline)", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const p = plain();

      // Boundaries as siblings at root level (already at same depth).
      // findBoundaries detects the pair, hoist is a no-op (already siblings),
      // prototype collapses them into a block.
      const r = root(s.node, p, e);

      const pairs = findBoundaries(r);
      hoist(pairs);
      prototype(r);

      expect(r.children).toHaveLength(1);
      const proto = r.children[0];
      expect(proto.content).toBeNull();
      expect(proto.element).not.toBeNull();
      expect(proto.element!.id).toBe(s.id);
      expect(proto.children).toHaveLength(1);
      expect(proto.children[0]).toBe(p);
    });

    it("T5 — no blocks", () => {
      const s = simple(tag("name"));
      const p = plain();
      const r = root(p, s);

      prototype(r);

      expect(r.children).toHaveLength(2);
      expect(r.children[0]).toBe(p);
      expect(r.children[1]).toBe(s);
    });
  });

  describe("structural properties", () => {
    it("P1 — no boundary nodes survive", () => {
      const ifTag = tag("#if", "x");
      const eachTag = tag("#each", "y");
      const s1 = start(ifTag);
      const s2 = start(eachTag);
      const p = plain();
      const e2 = end(s2.id, eachTag);
      const e1 = end(s1.id, ifTag);

      const r = root(s1.node, s2.node, p, e2, e1);
      prototype(r);

      const allNodes = collect(r);
      for (const node of allNodes) {
        // No start markers: id >= 0 with element === null
        if (node.id >= 0) {
          expect(node.element).not.toBeNull();
        }
        // No end markers: element.id !== node.id
        if (node.element !== null) {
          expect(node.element.id).toBe(node.id);
        }
      }
    });

    it("P2 — element preservation", () => {
      const ifTag = tag("#if", "x");
      const nameTag = tag("name");
      const s = start(ifTag);
      const sim = simple(nameTag);
      const e = end(s.id, ifTag);

      const endElement = e.element!;
      const simElement = sim.element!;

      const r = root(s.node, sim, e);
      prototype(r);

      const allNodes = collect(r);
      const elements = allNodes
        .filter((n) => n.element !== null)
        .map((n) => n.element);

      expect(elements).toContain(endElement);
      expect(elements).toContain(simElement);
    });

    it("P3 — content preservation", () => {
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const p1 = plain();
      const p2 = plain();
      const e = end(s.id, ifTag);
      const p3 = plain();

      const r = root(p1, s.node, p2, e, p3);
      prototype(r);

      // Collect all content nodes (id < 0, no element) in order
      const allNodes = collect(r);
      const contentNodes = allNodes.filter(
        (n) => n.id < 0 && n.element === null && n.content !== null,
      );

      // p1, p2, p3 should all be present (root excluded from check since it's the root)
      // Filter out root itself
      const nonRoot = contentNodes.filter((n) => n !== r);
      expect(nonRoot).toHaveLength(3);
      // Relative order: p1 before p2 before p3
      expect(nonRoot[0]).toBe(p1);
      expect(nonRoot[1]).toBe(p2);
      expect(nonRoot[2]).toBe(p3);
    });
  });
});
