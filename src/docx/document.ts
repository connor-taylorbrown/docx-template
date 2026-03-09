import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
import { XmlNode } from "./node.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * Map from zip entry path to the root element local name within that
 * component's XML.
 */
const COMPONENTS: Record<string, string> = {
  "word/document.xml": "body",
  "word/header1.xml": "hdr",
  "word/header2.xml": "hdr",
  "word/header3.xml": "hdr",
  "word/footer1.xml": "ftr",
  "word/footer2.xml": "ftr",
  "word/footer3.xml": "ftr",
};

/**
 * A parsed DOCX component: one XML document within the archive
 * that may contain template content.
 */
export interface Component {
  /** Path within the zip archive (e.g. "word/document.xml"). */
  path: string;
  /** The parsed XML document. */
  document: Document;
  /** Root tree node for template classification. */
  root: XmlNode;
}

const parser = new DOMParser();

/**
 * Read a DOCX file and extract all template-bearing components.
 *
 * Unzips the archive, parses each known component path that exists,
 * and wraps the root container (w:body, w:hdr, w:ftr) as an XmlNode.
 */
export function readDocx(buffer: Buffer): Component[] {
  const zip = new AdmZip(buffer);
  const components: Component[] = [];

  for (const [path, rootName] of Object.entries(COMPONENTS)) {
    const entry = zip.getEntry(path);
    if (!entry) continue;

    const xml = entry.getData().toString("utf-8");
    const doc = parser.parseFromString(xml, "text/xml");

    const roots = doc.getElementsByTagNameNS(W, rootName);
    if (roots.length === 0) continue;

    components.push({
      path,
      document: doc,
      root: new XmlNode(roots[0]),
    });
  }

  return components;
}
