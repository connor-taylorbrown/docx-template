import { ParagraphView, TreeNode } from "../template/document.js";
import { DomParagraphView } from "./paragraph.js";

/**
 * Concrete TreeNode backed by an HTML element from docx-preview output.
 * Projects every child element as a node. Paragraphs (<p>) are leaf
 * nodes; all other elements are containers whose children are
 * recursively projected.
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
    for (const child of this.element.children) {
      result.push(new DomNode(child));
    }
    return result;
  }

  text(): string {
    return this.element.textContent ?? "";
  }

  tagName(): string | null {
    return this.element.tagName;
  }

  paragraphView(): ParagraphView {
    return new DomParagraphView(this.element as HTMLParagraphElement);
  }
}
