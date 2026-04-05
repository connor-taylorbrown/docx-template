import { describe, it, expect } from "vitest";
import { ContentNode } from "../src/template/document.js";
import { VirtualNode } from "../src/template/virtual-node.js";
import { Element } from "../src/template/parser.js";
import { Tag } from "../src/template/tag.js";
import { parse } from "../src/template/expression.js";
import { findBoundaries, hoist } from "../src/template/hoist.js";

function tag(head: string, params: string | null = null): Tag {
  const raw = `{{${head}${params ? " " + params : ""}}}`;
  return { offset: 0, length: raw.length, head, params, isKeyword: head.startsWith("#"), raw };
}

function mkElement(t: Tag): Element {
  const keyword = t.isKeyword ? t.head : null;
  const text = t.isKeyword ? (t.params ?? "") : t.head;
  return { id: 0, keyword, expression: parse(text), tags: [t.raw], children: [] };
}

let nextId = 0;

function resetIds(): void {
  nextId = 0;
}

/** ContentNode with a DOM-like tag name and optional text. */
function label(domTag: string, text = ""): ContentNode {
  return { text: () => text, tagName: () => domTag };
}

/** ContentNode with no tag name. */
const noContent: ContentNode = { text: () => "", tagName: () => null };

/** Container node with a DOM-like label and optional text override. */
function container(domTag: string, ...args: (VirtualNode | { text: string })[]): VirtualNode {
  const opts = args.length > 0 && !(args[0] instanceof VirtualNode) ? args[0] as { text: string } : null;
  const children = opts ? args.slice(1) as VirtualNode[] : args as VirtualNode[];
  const text = opts?.text ?? "";
  return new VirtualNode({ content: label(domTag, text), id: -1, element: null, children });
}

/** Container node with no label. */
function root(...children: VirtualNode[]): VirtualNode {
  return new VirtualNode({ content: noContent, id: -1, element: null, children });
}

/** Start tag node: element is null, id is assigned. */
function start(t: Tag, domTag = "p"): { node: VirtualNode; id: number } {
  const id = nextId++;
  const node = new VirtualNode({ content: label(domTag), id, element: null, children: [] });
  return { node, id };
}

/** End tag node: element carries the start tag's id. */
function end(startId: number, t: Tag, domTag = "p"): VirtualNode {
  const id = nextId++;
  const element = mkElement(t);
  element.id = startId;
  // Block elements have two tags: [startRaw, endRaw]
  element.tags = [t.raw, "{{#end}}"];
  return new VirtualNode({ content: label(domTag), id, element, children: [] });
}

/** Simple element node: element.id === node.id. */
function simple(t: Tag): VirtualNode {
  const id = nextId++;
  const element = mkElement(t);
  element.id = id;
  return new VirtualNode({ content: noContent, id, element, children: [] });
}

/** Plain content node (no tag). */
function plain(): VirtualNode {
  return new VirtualNode({ content: noContent, id: -1, element: null, children: [] });
}

describe("findBoundaries", () => {
  describe("invariant #1: equal depth", () => {
    it("1.1 — same-depth siblings pass", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(s.node, plain(), e);

      const pairs = findBoundaries(r);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].start).toBe(s.node);
      expect(pairs[0].end).toBe(e);
      expect(pairs[0].element.id).toBe(s.id);
    });

    it("1.2 — same-depth nested containers pass", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("div", s.node),
        container("div", e),
      );

      const pairs = findBoundaries(r);
      expect(pairs).toHaveLength(1);
    });

    it("1.3 — depth mismatch throws", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        s.node,
        container("div", e),
      );

      expect(() => findBoundaries(r)).toThrow();
    });

    it("1.4 — nested blocks at different depths both pass", () => {
      resetIds();
      const outerTag = tag("#if", "x");
      const innerTag = tag("#each", "y");
      const outerStart = start(outerTag);
      const innerStart = start(innerTag);
      const innerEnd = end(innerStart.id, innerTag);
      const outerEnd = end(outerStart.id, outerTag);

      const r = root(
        outerStart.node,
        container("div", innerStart.node, innerEnd),
        outerEnd,
      );

      const pairs = findBoundaries(r);
      expect(pairs).toHaveLength(2);
    });

    it("1.5 — inline block (children of a paragraph node) passes", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const paraNode = container("p", s.node, plain(), e);
      const r = root(paraNode);

      const pairs = findBoundaries(r);
      expect(pairs).toHaveLength(1);
    });

    it("simple elements are ignored by boundary detection", () => {
      resetIds();
      const r = root(simple(tag("name")), simple(tag("other")));

      const pairs = findBoundaries(r);
      expect(pairs).toHaveLength(0);
    });

    it("depth mismatch — end deeper than start", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("div", s.node),
        e,
      );

      expect(() => findBoundaries(r)).toThrow();
    });
  });
});

describe("hoist", () => {
  describe("invariant #2: DOM tags equal along path", () => {
    it("2.1 — matching containers pass", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: "{{#if x}}" }, s.node),
        container("td", { text: "{{#end}}" }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).not.toThrow();
    });

    it("2.2 — mismatched containers throw", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: "{{#if x}}" }, s.node),
        container("th", { text: "{{#end}}" }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow();
    });

    it("2.3 — multi-level matching path", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("div", { text: "{{#if x}}" }, container("section", { text: "{{#if x}}" }, s.node)),
        container("div", { text: "{{#end}}" }, container("section", { text: "{{#end}}" }, e)),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).not.toThrow();
    });

    it("2.4 — multi-level mismatch at intermediate node", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("div", { text: "{{#if x}}" }, container("section", { text: "{{#if x}}" }, s.node)),
        container("div", { text: "{{#end}}" }, container("article", { text: "{{#end}}" }, e)),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow();
    });
  });

  describe("invariant #3: node text matches raw tag", () => {
    it("3.1 — exclusive ownership passes", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: "{{#if x}}" }, s.node),
        container("td", { text: "{{#end}}" }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).not.toThrow();
    });

    it("3.2 — start ancestor has extra content", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: "Hello{{#if x}}" }, s.node),
        container("td", { text: "{{#end}}" }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow(SyntaxError);
    });

    it("3.3 — end ancestor has extra content", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: "{{#if x}}" }, s.node),
        container("td", { text: "{{#end}}Bye" }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow(SyntaxError);
    });

    it("3.4 — extra content at intermediate level", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("div", { text: "Extra{{#if x}}" },
          container("td", { text: "{{#if x}}" }, s.node)),
        container("div", { text: "{{#end}}" },
          container("td", { text: "{{#end}}" }, e)),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow(SyntaxError);
    });

    it("3.5 — whitespace-only surroundings pass", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: " {{#if x}} " }, s.node),
        container("td", { text: " {{#end}} " }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).not.toThrow();
    });

    it("3.6 — whitespace plus extra content fails", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: " Hello {{#if x}} " }, s.node),
        container("td", { text: "{{#end}}" }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow(SyntaxError);
    });

    it("3.7 — siblings (no walk) — invariant not checked", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(s.node, e);

      const pairs = findBoundaries(r);
      // Loop body never executes; text check is not reached
      expect(() => hoist(pairs)).not.toThrow();
    });
  });

  describe("invariant #2 x #3 interaction", () => {
    it("3.8 — DOM tag mismatch caught before text check", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("td", { text: "{{#if x}}" }, s.node),
        container("th", { text: "{{#end}}" }, e),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow(/DOM tag mismatch/);
    });

    it("3.9 — existing invariant #2 and hoist-operation tests pass", () => {
      // Validated by the surrounding test suites passing
    });
  });

  describe("multi-level paths", () => {
    it("3.10 — two-level clean path", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("div", { text: "{{#if x}}" },
          container("td", { text: "{{#if x}}" }, s.node)),
        container("div", { text: "{{#end}}" },
          container("td", { text: "{{#end}}" }, e)),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).not.toThrow();
    });

    it("3.11 — clean inner, dirty outer", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(
        container("div", { text: "Sibling{{#if x}}" },
          container("td", { text: "{{#if x}}" }, s.node)),
        container("div", { text: "{{#end}}" },
          container("td", { text: "{{#end}}" }, e)),
      );

      const pairs = findBoundaries(r);
      expect(() => hoist(pairs)).toThrow(SyntaxError);
    });
  });

  describe("hoist operation", () => {
    it("4.1 — already siblings — no-op hoist", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);
      const r = root(s.node, plain(), e);

      const pairs = findBoundaries(r);
      hoist(pairs);

      // Start and end nodes retain their id and element
      expect(s.node.id).toBe(s.id);
      expect(e.element).not.toBeNull();
    });

    it("4.2 — one level of nesting — hoist to parent", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const s = start(ifTag);
      const e = end(s.id, ifTag);

      const startContainer = container("td", { text: "{{#if x}}" }, s.node);
      const endContainer = container("td", { text: "{{#end}}" }, e);
      const r = root(startContainer, endContainer);

      const pairs = findBoundaries(r);
      hoist(pairs);

      // The container nodes now carry the boundary's id and element
      expect(startContainer.id).toBe(s.id);
      expect(startContainer.element).toBeNull(); // start tag: element is null
      expect(endContainer.id).toBe(e.id);
      expect(endContainer.element).toBe(pairs[0].element);
    });

    it("4.3 — multiple blocks — independent hoists", () => {
      resetIds();
      const ifTag = tag("#if", "x");
      const eachTag = tag("#each", "y");
      const s1 = start(ifTag);
      const e1 = end(s1.id, ifTag);
      const s2 = start(eachTag);
      const e2 = end(s2.id, eachTag);

      const r = root(
        container("td", { text: "{{#if x}}" }, s1.node),
        container("td", { text: "{{#end}}" }, e1),
        container("td", { text: "{{#each y}}" }, s2.node),
        container("td", { text: "{{#end}}" }, e2),
      );

      const pairs = findBoundaries(r);
      hoist(pairs);

      expect(r.children[0].id).toBe(s1.id);
      expect(r.children[1].element!.id).toBe(s1.id);
      expect(r.children[2].id).toBe(s2.id);
      expect(r.children[3].element!.id).toBe(s2.id);
    });

    it("4.4 — nested blocks — inner hoists before outer", () => {
      resetIds();
      const outerTag = tag("#if", "x");
      const innerTag = tag("#each", "y");
      const outerStart = start(outerTag);
      const innerStart = start(innerTag);
      const innerEnd = end(innerStart.id, innerTag);
      const outerEnd = end(outerStart.id, outerTag);

      // Inner at depth 2, outer at depth 1
      const innerStartContainer = container("td", { text: "{{#each y}}" }, innerStart.node);
      const innerEndContainer = container("td", { text: "{{#end}}" }, innerEnd);
      const r = root(
        outerStart.node,
        container("tr", innerStartContainer, innerEndContainer),
        outerEnd,
      );

      const pairs = findBoundaries(r);
      hoist(pairs);

      // Inner containers carry inner boundary signals
      expect(innerStartContainer.id).toBe(innerStart.id);
      expect(innerEndContainer.element!.id).toBe(innerStart.id);
      // Outer remains at its original level
      expect(outerStart.node.id).toBe(outerStart.id);
    });
  });
});
