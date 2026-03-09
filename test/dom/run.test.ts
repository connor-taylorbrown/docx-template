import { describe, it, expect } from "vitest";
import { DomRun } from "../../src/dom/run.js";
import { span } from "./dom-helper.js";

function run(text: string, style?: string): DomRun {
  return new DomRun(span(text, style));
}

describe("DomRun", () => {
  describe("length", () => {
    it("simple text", () => {
      expect(run("Hello").length).toBe(5);
    });

    it("empty span", () => {
      expect(run("").length).toBe(0);
    });
  });

  describe("split", () => {
    it("splits in the middle", () => {
      const [left, right] = run("Hello").split(3);
      expect(left.el.textContent).toBe("Hel");
      expect(right.el.textContent).toBe("lo");
      expect(left.length).toBe(3);
      expect(right.length).toBe(2);
    });

    it("split at start", () => {
      const [left, right] = run("Hello").split(0);
      expect(left.el.textContent).toBe("");
      expect(right.el.textContent).toBe("Hello");
    });

    it("split at end", () => {
      const [left, right] = run("Hello").split(5);
      expect(left.el.textContent).toBe("Hello");
      expect(right.el.textContent).toBe("");
    });

    it("preserves inline styles on both halves", () => {
      const [left, right] = run("Hello", "font-weight: bold").split(2);
      expect(left.el.getAttribute("style")).toBe("font-weight: bold");
      expect(right.el.getAttribute("style")).toBe("font-weight: bold");
    });

    it("does not mutate the original", () => {
      const r = run("Hello");
      r.split(3);
      expect(r.el.textContent).toBe("Hello");
    });
  });

  describe("merge", () => {
    it("merges two runs", () => {
      const merged = run("Hel").merge([run("lo")]);
      expect(merged.el.textContent).toBe("Hello");
      expect(merged.length).toBe(5);
    });

    it("merges multiple runs", () => {
      const merged = run("a").merge([run("b"), run("c")]);
      expect(merged.el.textContent).toBe("abc");
    });

    it("merges empty queue", () => {
      const merged = run("Hello").merge([]);
      expect(merged.el.textContent).toBe("Hello");
      expect(merged.length).toBe(5);
    });

    it("preserves receiver's styles", () => {
      const merged = run("Hel", "font-weight: bold").merge([run("lo")]);
      expect(merged.el.getAttribute("style")).toBe("font-weight: bold");
    });
  });
});
