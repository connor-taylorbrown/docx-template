import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { readDocx } from "../../src/docx/document.js";
import { TreeReader } from "../../src/template/tree-reader.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function buildDocx(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.addFile(path, Buffer.from(content, "utf-8"));
  }
  return zip.toBuffer();
}

function documentXml(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${bodyXml}</w:body></w:document>`;
}

function headerXml(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${W}">${bodyXml}</w:hdr>`;
}

function p(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

describe("OOXML smoke test", () => {
  it("X1 — simple tag", () => {
    const buffer = buildDocx({
      "word/document.xml": documentXml(p("{{name}}")),
    });
    const [component] = readDocx(buffer);
    const reader = new TreeReader();
    reader.classify(component.root);
    const result = reader.result();

    expect(result).toHaveLength(1);
    expect(result[0].expression.text!).toBe("name");
    expect(result[0].keyword).toBeNull();
  });

  it("X2 — block element", () => {
    const buffer = buildDocx({
      "word/document.xml": documentXml(
        p("{{#if show}}") + p("Hello") + p("{{#end}}"),
      ),
    });
    const [component] = readDocx(buffer);
    const reader = new TreeReader();
    reader.classify(component.root);
    const result = reader.result();

    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe("#if");
    expect(result[0].children).toBeDefined();
  });

  it("X3 — multi-component", () => {
    const buffer = buildDocx({
      "word/document.xml": documentXml(p("{{title}}")),
      "word/header1.xml": headerXml(p("{{subtitle}}")),
    });
    const components = readDocx(buffer);
    expect(components).toHaveLength(2);

    const results = components.map((c) => {
      const reader = new TreeReader();
      reader.classify(c.root);
      return reader.result();
    });

    expect(results[0]).toHaveLength(1);
    expect(results[0][0].expression.text!).toBe("title");
    expect(results[1]).toHaveLength(1);
    expect(results[1][0].expression.text!).toBe("subtitle");
  });
});
