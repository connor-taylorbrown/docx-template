import { describe, it, expect } from "vitest";
import { XmlParagraphView } from "../../src/docx/paragraph.js";
import { XmlRun } from "../../src/docx/run.js";
import { parseXml, textOf } from "./xml-helper.js";

function view(xml: string): XmlParagraphView {
  return new XmlParagraphView(parseXml(xml));
}

describe("XmlParagraphView", () => {
  describe("text", () => {
    it("single run", () => {
      const v = view('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>');
      expect(v.text()).toBe("Hello");
    });

    it("multiple runs", () => {
      const v = view('<w:p><w:r><w:t>Hel</w:t></w:r><w:r><w:t>lo</w:t></w:r></w:p>');
      expect(v.text()).toBe("Hello");
    });

    it("with paragraph properties", () => {
      const v = view('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Hi</w:t></w:r></w:p>');
      expect(v.text()).toBe("Hi");
    });
  });

  describe("runs", () => {
    it("returns XmlRun instances", () => {
      const v = view('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>');
      const runs = v.runs();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toBeInstanceOf(XmlRun);
    });

    it("multiple runs in order", () => {
      const v = view('<w:p><w:r><w:t>a</w:t></w:r><w:r><w:t>b</w:t></w:r></w:p>');
      const runs = v.runs();
      expect(runs).toHaveLength(2);
      expect(textOf((runs[0] as XmlRun).el)).toBe("a");
      expect(textOf((runs[1] as XmlRun).el)).toBe("b");
    });

    it("skips non-run elements", () => {
      const v = view('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Hi</w:t></w:r><w:bookmarkStart/></w:p>');
      const runs = v.runs();
      expect(runs).toHaveLength(1);
    });
  });

  describe("replaceChildren", () => {
    it("replaces runs while preserving pPr", () => {
      const el = parseXml('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>old</w:t></w:r></w:p>');
      const v = new XmlParagraphView(el);

      const newRun = new XmlRun(parseXml('<w:r><w:t>new</w:t></w:r>'));
      v.replaceChildren([newRun]);

      // pPr should still be there
      expect(el.getElementsByTagNameNS("*", "pPr").length).toBe(1);
      // Old run should be gone, new run present
      const runs = v.runs();
      expect(runs).toHaveLength(1);
      expect(textOf((runs[0] as XmlRun).el)).toBe("new");
      expect(v.text()).toBe("new");
    });

    it("replaces all runs with multiple new runs", () => {
      const el = parseXml('<w:p><w:r><w:t>old</w:t></w:r></w:p>');
      const v = new XmlParagraphView(el);

      const r1 = new XmlRun(parseXml('<w:r><w:t>a</w:t></w:r>'));
      const r2 = new XmlRun(parseXml('<w:r><w:t>b</w:t></w:r>'));
      v.replaceChildren([r1, r2]);

      expect(v.runs()).toHaveLength(2);
      expect(v.text()).toBe("ab");
    });
  });
});
