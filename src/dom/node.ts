import { ParagraphView } from "../template/inline.js";
import { TreeNode } from "../template/tree-reader.js";
import { DomParagraphView } from "./paragraph.js";

/**
 * HTML element tag names that act as containers in the docx-preview
 * output. Each may contain paragraphs or further nested containers.
 */
const CONTAINER_NAMES = new Set([
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "TD",
  "TH",
  "FOREIGNOBJECT",
]);

/**
 * Concrete TreeNode backed by an HTML element from docx-preview output.
 * Classifies elements as paragraphs (<p>) or containers (article, header,
 * footer, td, foreignObject), traversing transparently through everything
 * else to reach nested content.
 */
export class DomNode extends TreeNode {
  constructor(private readonly element: Element) {
    super();
  }

  /** The underlying DOM element. */
  get el(): Element {
    return this.element;
  }

  isParagraph(): boolean {
    return this.element.tagName === "P";
  }

  children(): DomNode[] {
    if (this.isParagraph()) return [];

    const result: DomNode[] = [];
    const collect = (parent: Element) => {
      for (const child of parent.children) {
        if (child.tagName === "P" || CONTAINER_NAMES.has(child.tagName)) {
          result.push(new DomNode(child));
        } else {
          collect(child);
        }
      }
    };
    collect(this.element);
    return result;
  }

  text(): string {
    return this.element.textContent ?? "";
  }

  paragraphView(): ParagraphView {
    return new DomParagraphView(this.element as HTMLParagraphElement);
  }
}
