/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { renderAsync } from "docx-preview";
import { TreeReader } from "../../src/template/tree-reader.js";
import { DomNode } from "../../src/dom/node.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${CT}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** Build a minimal DOCX buffer. */
function buildDocx(bodyXml: string): Buffer {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}">
  <w:body>${bodyXml}</w:body>
</w:document>`;
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(CONTENT_TYPES, "utf-8"));
  zip.addFile("_rels/.rels", Buffer.from(RELS, "utf-8"));
  zip.addFile("word/document.xml", Buffer.from(xml, "utf-8"));
  return zip.toBuffer();
}

/** Render a DOCX buffer with docx-preview. */
async function render(buffer: Buffer): Promise<Element> {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await renderAsync(buffer, container, undefined, {
    inWrapper: false,
    ignoreLastRenderedPageBreak: true,
  });

  return container;
}

describe("docx-preview smoke test", () => {
  it("detects a simple tag", async () => {
    const buffer = buildDocx(
      '<w:p><w:r><w:t>{{name}}</w:t></w:r></w:p>',
    );
    const container = await render(buffer);

    const root = new DomNode(container);
    const reader = new TreeReader();
    reader.classify(root);
    const result = reader.result();

    expect(result).toHaveLength(1);
    expect(result[0].expression.text!()).toBe("name");
  });

  it("detects a block element", async () => {
    const buffer = buildDocx(`
      <w:p><w:r><w:t>{{#if show}}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
      <w:p><w:r><w:t>{{#end}}</w:t></w:r></w:p>
    `);
    const container = await render(buffer);

    const root = new DomNode(container);
    const reader = new TreeReader();
    reader.classify(root);
    const result = reader.result();

    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe("#if");
    expect(result[0].children).toBeDefined();
  });
});
