import { ParagraphView } from "../template/inline.js";
import { TreeNode } from "../template/tree-reader.js";
import { XmlParagraphView } from "./paragraph.js";

/** OOXML namespace URI. */
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * Element local names that act as containers in the document tree.
 * Each may contain paragraphs or further nested containers.
 */
const CONTAINER_NAMES = new Set([
  "body",
  "tbl",
  "tr",
  "tc",
  "txbxContent",
  "sdtContent",
  "hdr",
  "ftr",
]);

/** Check if an element is a w: namespace paragraph. */
function isParagraphElement(el: Element): boolean {
  return el.localName === "p" && el.namespaceURI === W;
}

/** Check if an element is a known container. */
function isContainer(el: Element): boolean {
  return CONTAINER_NAMES.has(el.localName) && el.namespaceURI === W;
}

/**
 * Collect child elements of a node, returning element children only.
 */
function elementChildren(node: Node): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    if (node.childNodes[i].nodeType === 1) {
      result.push(node.childNodes[i] as Element);
    }
  }
  return result;
}

/**
 * Concrete TreeNode backed by an OOXML element. Classifies elements
 * as paragraphs (w:p) or containers (w:body, w:tc, etc.) and
 * traverses the tree accordingly.
 *
 * Non-container, non-paragraph elements are traversed transparently
 * to reach nested content (e.g. w:sdt wraps sdtContent, mc:AlternateContent
 * wraps w:txbxContent via intermediate elements).
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
    return isParagraphElement(this.element);
  }

  children(): XmlNode[] {
    if (this.isParagraph()) return [];

    const result: XmlNode[] = [];
    const collect = (parent: Node) => {
      for (const child of elementChildren(parent)) {
        if (isParagraphElement(child) || isContainer(child)) {
          result.push(new XmlNode(child));
        } else {
          // Transparent traversal: recurse into wrappers
          collect(child);
        }
      }
    };
    collect(this.element);
    return result;
  }

  text(): string {
    return new XmlParagraphView(this.element).text();
  }

  paragraphView(): ParagraphView {
    return new XmlParagraphView(this.element);
  }
}
