import { describe, it, expect } from "vitest";
import { XmlRun } from "../../src/docx/run.js";
import { parseXml, textOf } from "./xml-helper.js";

/** Create an XmlRun from an XML string. */
function run(xml: string): XmlRun {
  return new XmlRun(parseXml(xml));
}

describe("XmlRun", () => {
  describe("length", () => {
    it("single w:t", () => {
      const r = run('<w:r><w:t>Hello</w:t></w:r>');
      expect(r.length).toBe(5);
    });

    it("multiple w:t nodes", () => {
      const r = run('<w:r><w:t>Hel</w:t><w:t>lo</w:t></w:r>');
      expect(r.length).toBe(5);
    });

    it("with w:rPr", () => {
      const r = run('<w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>');
      expect(r.length).toBe(4);
    });

    it("empty run", () => {
      const r = run('<w:r><w:t></w:t></w:r>');
      expect(r.length).toBe(0);
    });
  });

  describe("split", () => {
    it("splits single w:t in the middle", () => {
      const r = run('<w:r><w:t>Hello</w:t></w:r>');
      const [left, right] = r.split(3);

      expect(left.length).toBe(3);
      expect(right.length).toBe(2);
      expect(textOf(left.el)).toBe("Hel");
      expect(textOf(right.el)).toBe("lo");
    });

    it("split at start produces empty left", () => {
      const r = run('<w:r><w:t>Hello</w:t></w:r>');
      const [left, right] = r.split(0);

      expect(left.length).toBe(0);
      expect(right.length).toBe(5);
    });

    it("split at end produces empty right", () => {
      const r = run('<w:r><w:t>Hello</w:t></w:r>');
      const [left, right] = r.split(5);

      expect(left.length).toBe(5);
      expect(right.length).toBe(0);
    });

    it("preserves formatting on both halves", () => {
      const r = run('<w:r><w:rPr><w:b/></w:rPr><w:t>Hello</w:t></w:r>');
      const [left, right] = r.split(2);

      expect(left.el.getElementsByTagNameNS("*", "b").length).toBe(1);
      expect(right.el.getElementsByTagNameNS("*", "b").length).toBe(1);
      expect(textOf(left.el)).toBe("He");
      expect(textOf(right.el)).toBe("llo");
    });

    it("does not mutate the original element", () => {
      const r = run('<w:r><w:t>Hello</w:t></w:r>');
      r.split(3);

      expect(r.length).toBe(5);
      expect(textOf(r.el)).toBe("Hello");
    });
  });

  describe("merge", () => {
    it("merges two runs", () => {
      const r1 = run('<w:r><w:t>Hel</w:t></w:r>');
      const r2 = run('<w:r><w:t>lo</w:t></w:r>');
      const merged = r1.merge([r2]);

      expect(merged.length).toBe(5);
      expect(textOf(merged.el)).toBe("Hello");
    });

    it("merges multiple runs", () => {
      const r1 = run('<w:r><w:t>a</w:t></w:r>');
      const r2 = run('<w:r><w:t>b</w:t></w:r>');
      const r3 = run('<w:r><w:t>c</w:t></w:r>');
      const merged = r1.merge([r2, r3]);

      expect(merged.length).toBe(3);
      expect(textOf(merged.el)).toBe("abc");
    });

    it("merges empty queue", () => {
      const r = run('<w:r><w:t>Hello</w:t></w:r>');
      const merged = r.merge([]);

      expect(merged.length).toBe(5);
      expect(textOf(merged.el)).toBe("Hello");
    });

    it("preserves formatting of receiver", () => {
      const r1 = run('<w:r><w:rPr><w:b/></w:rPr><w:t>Hel</w:t></w:r>');
      const r2 = run('<w:r><w:t>lo</w:t></w:r>');
      const merged = r1.merge([r2]);

      expect(merged.el.getElementsByTagNameNS("*", "b").length).toBe(1);
      expect(textOf(merged.el)).toBe("Hello");
    });
  });
});
