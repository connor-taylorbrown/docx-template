import { describe, it, expect } from "vitest";
import { Tag, detectTags } from "../src/template/tag.js";

describe("detectTags", () => {
  describe("no tags", () => {
    it("plain text", () => {
      expect(detectTags("Hello world")).toEqual([]);
    });

    it("empty string", () => {
      expect(detectTags("")).toEqual([]);
    });

    it("single braces", () => {
      expect(detectTags("Hello {world}")).toEqual([]);
    });

    it("incomplete open", () => {
      expect(detectTags("Hello {{world")).toEqual([]);
    });
  });

  describe("simple tags", () => {
    it("single tag", () => {
      const result = detectTags("{{name}}");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual<Tag>({
        offset: 0,
        length: 8,
        head: "name",
        params: null,
        isKeyword: false,
      });
    });

    it("tag with surrounding text", () => {
      const result = detectTags("Hello {{name}} world");
      expect(result).toHaveLength(1);
      expect(result[0].offset).toBe(6);
      expect(result[0].length).toBe(8);
    });

    it("tag at end", () => {
      const result = detectTags("Hello {{name}}");
      expect(result).toHaveLength(1);
      expect(result[0].offset).toBe(6);
    });

    it("tag at start", () => {
      const result = detectTags("{{name}} world");
      expect(result).toHaveLength(1);
      expect(result[0].offset).toBe(0);
    });
  });

  describe("keyword tags", () => {
    it("keyword no params", () => {
      const result = detectTags("{{#end}}");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual<Tag>({
        offset: 0,
        length: 8,
        head: "#end",
        params: null,
        isKeyword: true,
      });
    });

    it("keyword with params", () => {
      const result = detectTags("{{#if show}}");
      expect(result).toHaveLength(1);
      expect(result[0].head).toBe("#if");
      expect(result[0].params).toBe("show");
      expect(result[0].isKeyword).toBe(true);
      expect(result[0].length).toBe(12);
    });

    it("keyword with multiple params", () => {
      const result = detectTags("{{#each items sep=,}}");
      expect(result).toHaveLength(1);
      expect(result[0].head).toBe("#each");
      expect(result[0].params).toBe("items sep=,");
    });
  });

  describe("multiple tags", () => {
    it("two tags", () => {
      const result = detectTags("{{a}} and {{b}}");
      expect(result).toHaveLength(2);
      expect(result[0].offset).toBe(0);
      expect(result[0].head).toBe("a");
      expect(result[1].offset).toBe(10);
      expect(result[1].head).toBe("b");
    });

    it("adjacent tags", () => {
      const result = detectTags("{{a}}{{b}}");
      expect(result).toHaveLength(2);
      expect(result[0].offset).toBe(0);
      expect(result[0].length).toBe(5);
      expect(result[1].offset).toBe(5);
      expect(result[1].length).toBe(5);
    });

    it("mixed keyword and simple", () => {
      const result = detectTags("{{#if x}}{{name}}{{#end}}");
      expect(result).toHaveLength(3);
      expect(result[0].head).toBe("#if");
      expect(result[0].isKeyword).toBe(true);
      expect(result[1].head).toBe("name");
      expect(result[1].isKeyword).toBe(false);
      expect(result[2].head).toBe("#end");
      expect(result[2].isKeyword).toBe(true);
    });
  });

  describe("whitespace in tags", () => {
    it("trailing space in params", () => {
      const result = detectTags("{{#if  show }}");
      expect(result).toHaveLength(1);
      expect(result[0].head).toBe("#if");
      expect(result[0].params).toBe("show");
    });

    it("space-only params", () => {
      const result = detectTags("{{#end }}");
      expect(result).toHaveLength(1);
      expect(result[0].head).toBe("#end");
      expect(result[0].params).toBeNull();
    });
  });
});
