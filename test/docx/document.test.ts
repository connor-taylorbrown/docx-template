import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { readDocx } from "../../src/docx/document.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Build a minimal DOCX buffer with the given XML components. */
function buildDocx(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.addFile(path, Buffer.from(content, "utf-8"));
  }
  return zip.toBuffer();
}

const MINIMAL_DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
    <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const MINIMAL_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${W}">
  <w:p><w:r><w:t>Header text</w:t></w:r></w:p>
</w:hdr>`;

describe("readDocx", () => {
  it("reads document.xml component", () => {
    const buffer = buildDocx({ "word/document.xml": MINIMAL_DOCUMENT });
    const components = readDocx(buffer);

    expect(components).toHaveLength(1);
    expect(components[0].path).toBe("word/document.xml");

    const children = components[0].root.children();
    expect(children).toHaveLength(1);
    expect(children[0].isParagraph()).toBe(true);
    expect(children[0].text()).toBe("Hello");
  });

  it("reads multiple components", () => {
    const buffer = buildDocx({
      "word/document.xml": MINIMAL_DOCUMENT,
      "word/header1.xml": MINIMAL_HEADER,
    });
    const components = readDocx(buffer);

    expect(components).toHaveLength(2);
    expect(components[0].path).toBe("word/document.xml");
    expect(components[1].path).toBe("word/header1.xml");

    const headerParagraph = components[1].root.children()[0];
    expect(headerParagraph.text()).toBe("Header text");
  });

  it("skips missing components", () => {
    const buffer = buildDocx({ "word/document.xml": MINIMAL_DOCUMENT });
    const components = readDocx(buffer);

    // Only document.xml exists — no headers or footers
    expect(components).toHaveLength(1);
  });
});
