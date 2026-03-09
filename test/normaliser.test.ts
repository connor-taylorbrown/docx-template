import { describe, it, expect } from "vitest";
import { Tag } from "../src/template/tag.js";
import { normalise, NormalisedEntry } from "../src/template/normaliser.js";
import { TestRun } from "./test-run.js";

/** Helper to build a tag descriptor. */
function tag(offset: number, length: number, head = "x"): Tag {
  return {
    offset,
    length,
    head,
    params: null,
    isKeyword: head.startsWith("#"),
  };
}

/** Extract text content from normalised entries for assertion readability. */
function texts(entries: NormalisedEntry[]): string[] {
  return entries.map((e) => (e.content as TestRun).text);
}

/** Extract (text, hasTag) tuples. */
function summary(entries: NormalisedEntry[]): [string, boolean][] {
  return entries.map((e) => [(e.content as TestRun).text, e.tag !== null]);
}

describe("normaliser", () => {
  describe("single run, single tag", () => {
    it("case 3: tag fills entire run (open on, close on)", () => {
      //  "{{x}}" — one run, one tag covering it all
      const runs = [new TestRun("{{x}}")];
      const tags = [tag(0, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([["{{x}}", true]]);
    });

    it("case 3: tag in middle of run (open on, close on with pre/post content)", () => {
      //  "Hello {{x}} world"
      const runs = [new TestRun("Hello {{x}} world")];
      const tags = [tag(6, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["Hello ", false],
        ["{{x}}", true],
        [" world", false],
      ]);
    });

    it("case 3: tag at start of run with trailing content", () => {
      //  "{{x}} world"
      const runs = [new TestRun("{{x}} world")];
      const tags = [tag(0, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["{{x}}", true],
        [" world", false],
      ]);
    });

    it("case 3: tag at end of run with leading content", () => {
      //  "Hello {{x}}"
      const runs = [new TestRun("Hello {{x}}")];
      const tags = [tag(6, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["Hello ", false],
        ["{{x}}", true],
      ]);
    });
  });

  describe("tag spanning multiple runs", () => {
    it("case 2→4→5: tag spans three runs", () => {
      //  "He{{" + "x" + "}}world"
      //  Tag at offset 2, length 5
      const runs = [
        new TestRun("He{{"),
        new TestRun("x"),
        new TestRun("}}world"),
      ];
      const tags = [tag(2, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["He", false],
        ["{{x}}", true],
        ["world", false],
      ]);
    });

    it("case 2→5: tag spans two runs", () => {
      //  "He{{x" + "}} world"
      //  Tag at offset 2, length 5
      const runs = [new TestRun("He{{x"), new TestRun("}} world")];
      const tags = [tag(2, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["He", false],
        ["{{x}}", true],
        [" world", false],
      ]);
    });

    it("case 4→5: tag starts at run boundary, spans two runs", () => {
      //  "{{x" + "}}"
      //  Tag at offset 0, length 5
      const runs = [new TestRun("{{x"), new TestRun("}}")];
      const tags = [tag(0, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([["{{x}}", true]]);
    });
  });

  describe("no-tag runs (case 1)", () => {
    it("run before any tag is passed through", () => {
      //  "Hello " + "{{x}}"
      const runs = [new TestRun("Hello "), new TestRun("{{x}}")];
      const tags = [tag(6, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["Hello ", false],
        ["{{x}}", true],
      ]);
    });

    it("run after all tags is passed through", () => {
      //  "{{x}}" + " world"
      const runs = [new TestRun("{{x}}"), new TestRun(" world")];
      const tags = [tag(0, 5)];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["{{x}}", true],
        [" world", false],
      ]);
    });

    it("runs with no tags at all", () => {
      const runs = [new TestRun("Hello"), new TestRun(" world")];
      const result = normalise(runs, []);
      expect(summary(result)).toEqual([
        ["Hello", false],
        [" world", false],
      ]);
    });
  });

  describe("multiple tags", () => {
    it("two tags in one run", () => {
      //  "{{a}} {{b}}"
      const runs = [new TestRun("{{a}} {{b}}")];
      const tags = [tag(0, 5, "a"), tag(6, 5, "b")];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["{{a}}", true],
        [" ", false],
        ["{{b}}", true],
      ]);
    });

    it("adjacent tags with no gap", () => {
      //  "{{a}}{{b}}"
      const runs = [new TestRun("{{a}}{{b}}")];
      const tags = [tag(0, 5, "a"), tag(5, 5, "b")];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["{{a}}", true],
        ["{{b}}", true],
      ]);
    });

    it("two tags each in their own run", () => {
      //  "{{a}}" + "{{b}}"
      const runs = [new TestRun("{{a}}"), new TestRun("{{b}}")];
      const tags = [tag(0, 5, "a"), tag(5, 5, "b")];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["{{a}}", true],
        ["{{b}}", true],
      ]);
    });

    it("two tags across three runs with interleaving", () => {
      //  "pre{{a" + "}}mid{{b" + "}}post"
      const runs = [
        new TestRun("pre{{a"),
        new TestRun("}}mid{{b"),
        new TestRun("}}post"),
      ];
      const tags = [tag(3, 5, "a"), tag(11, 5, "b")];
      const result = normalise(runs, tags);
      expect(summary(result)).toEqual([
        ["pre", false],
        ["{{a}}", true],
        ["mid", false],
        ["{{b}}", true],
        ["post", false],
      ]);
    });
  });

  describe("edge cases", () => {
    it("empty run list", () => {
      const result = normalise([], []);
      expect(result).toEqual([]);
    });

    it("single empty run, no tags", () => {
      const runs = [new TestRun("")];
      const result = normalise(runs, []);
      expect(texts(result)).toEqual([""]);
    });
  });
});
