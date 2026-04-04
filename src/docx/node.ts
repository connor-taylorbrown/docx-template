import { ParagraphView, TreeNode } from "../template/document.js";
import { XmlParagraphView } from "./paragraph.js";

/** OOXML namespace URI. */
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * Concrete TreeNode backed by an OOXML element. Projects every child
 * element as a node. Paragraphs (w:p) are leaf nodes; all other
 * elements are containers whose children are recursively projected.
 */
export class XmlNode extends TreeNode {
  constructor(private readonly element: Element) {
    super();
  }

  /** The underlying XML element. */
  get el(): Element {
    return this.element;
  }

  isParagraph(): boolean {
    return this.element.localName === "p" && this.element.namespaceURI === W;
  }

  children(): XmlNode[] {
    if (this.isParagraph()) return [];

    const result: XmlNode[] = [];
    for (let i = 0; i < this.element.childNodes.length; i++) {
      if (this.element.childNodes[i].nodeType === 1) {
        result.push(new XmlNode(this.element.childNodes[i] as Element));
      }
    }
    return result;
  }

  text(): string {
    return new XmlParagraphView(this.element).text();
  }

  tagName(): string | null {
    return this.element.localName;
  }

  paragraphView(): ParagraphView {
    return new XmlParagraphView(this.element);
  }
}
