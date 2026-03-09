import { describe, it, expect } from "vitest";
import { DomParagraphView } from "../../src/dom/paragraph.js";
import { DomRun } from "../../src/dom/run.js";
import { p, span } from "./dom-helper.js";

describe("DomParagraphView", () => {
  describe("text", () => {
    it("single span", () => {
      const view = new DomParagraphView(p(span("Hello")));
      expect(view.text()).toBe("Hello");
    });

    it("multiple spans", () => {
      const view = new DomParagraphView(p(span("Hel"), span("lo")));
      expect(view.text()).toBe("Hello");
    });
  });

  describe("runs", () => {
    it("returns DomRun instances", () => {
      const view = new DomParagraphView(p(span("Hello")));
      const runs = view.runs();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toBeInstanceOf(DomRun);
    });

    it("multiple spans in order", () => {
      const view = new DomParagraphView(p(span("a"), span("b")));
      const runs = view.runs();
      expect(runs).toHaveLength(2);
      expect((runs[0] as DomRun).el.textContent).toBe("a");
      expect((runs[1] as DomRun).el.textContent).toBe("b");
    });
  });

  describe("replaceChildren", () => {
    it("replaces spans", () => {
      const para = p(span("old"));
      const view = new DomParagraphView(para);

      const newRun = new DomRun(span("new"));
      view.replaceChildren([newRun]);

      expect(view.runs()).toHaveLength(1);
      expect(view.text()).toBe("new");
    });

    it("replaces with multiple runs", () => {
      const para = p(span("old"));
      const view = new DomParagraphView(para);

      view.replaceChildren([new DomRun(span("a")), new DomRun(span("b"))]);

      expect(view.runs()).toHaveLength(2);
      expect(view.text()).toBe("ab");
    });

    it("preserves paragraph class and style", () => {
      const para = p(span("old"));
      para.className = "docx_normal";
      para.setAttribute("style", "margin: 0pt");
      const view = new DomParagraphView(para);

      view.replaceChildren([new DomRun(span("new"))]);

      expect(para.className).toBe("docx_normal");
      expect(para.getAttribute("style")).toBe("margin: 0pt");
    });
  });
});
