import { describe, it, expect } from "vitest";
import { XmlNode } from "../../src/docx/node.js";
import { parseXml } from "./xml-helper.js";

function node(xml: string): XmlNode {
  return new XmlNode(parseXml(xml));
}

describe("XmlNode", () => {
  describe("isParagraph", () => {
    it("w:p is a paragraph", () => {
      expect(node('<w:p><w:r><w:t>Hi</w:t></w:r></w:p>').isParagraph()).toBe(true);
    });

    it("w:body is not a paragraph", () => {
      expect(node('<w:body></w:body>').isParagraph()).toBe(false);
    });

    it("w:tbl is not a paragraph", () => {
      expect(node('<w:tbl></w:tbl>').isParagraph()).toBe(false);
    });
  });

  describe("text", () => {
    it("extracts text from paragraph", () => {
      const n = node('<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t> world</w:t></w:r></w:p>');
      expect(n.text()).toBe("Hello world");
    });

    it("skips run properties", () => {
      const n = node('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r></w:p>');
      expect(n.text()).toBe("Bold");
    });
  });

  describe("children", () => {
    it("body with paragraphs", () => {
      const n = node('<w:body><w:p><w:r><w:t>a</w:t></w:r></w:p><w:p><w:r><w:t>b</w:t></w:r></w:p></w:body>');
      const children = n.children();
      expect(children).toHaveLength(2);
      expect(children[0].isParagraph()).toBe(true);
      expect(children[1].isParagraph()).toBe(true);
    });

    it("table structure", () => {
      const n = node(`
        <w:body>
          <w:tbl>
            <w:tr>
              <w:tc>
                <w:p><w:r><w:t>cell</w:t></w:r></w:p>
              </w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      `);
      const children = n.children();
      expect(children).toHaveLength(1);
      expect(children[0].isParagraph()).toBe(false);
      // tbl > tr > tc > p
      const tbl = children[0];
      const tr = tbl.children()[0];
      const tc = tr.children()[0];
      const p = tc.children()[0];
      expect(p.isParagraph()).toBe(true);
      expect(p.text()).toBe("cell");
    });

    it("full projection through wrappers", () => {
      const n = node(`
        <w:body>
          <w:sdt>
            <w:sdtContent>
              <w:p><w:r><w:t>inside sdt</w:t></w:r></w:p>
            </w:sdtContent>
          </w:sdt>
        </w:body>
      `);
      // body sees w:sdt directly
      const children = n.children();
      expect(children).toHaveLength(1);
      expect(children[0].isParagraph()).toBe(false);
      // sdt > sdtContent > p
      const sdtContent = children[0].children()[0];
      const p = sdtContent.children()[0];
      expect(p.isParagraph()).toBe(true);
      expect(p.text()).toBe("inside sdt");
    });

    it("mixed paragraphs and containers", () => {
      const n = node(`
        <w:body>
          <w:p><w:r><w:t>before</w:t></w:r></w:p>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
          <w:p><w:r><w:t>after</w:t></w:r></w:p>
        </w:body>
      `);
      const children = n.children();
      expect(children).toHaveLength(3);
      expect(children[0].isParagraph()).toBe(true);
      expect(children[0].text()).toBe("before");
      expect(children[1].isParagraph()).toBe(false);
      expect(children[2].isParagraph()).toBe(true);
      expect(children[2].text()).toBe("after");
    });

    it("paragraph returns no children", () => {
      const n = node('<w:p><w:r><w:t>Hi</w:t></w:r></w:p>');
      expect(n.children()).toEqual([]);
    });
  });

  describe("paragraphView", () => {
    it("returns a working ParagraphView", () => {
      const n = node('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>');
      const view = n.paragraphView();
      expect(view.text()).toBe("Hello");
      expect(view.runs()).toHaveLength(1);
    });
  });
});
