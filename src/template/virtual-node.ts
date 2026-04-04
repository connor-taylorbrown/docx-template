import type { ContentNode } from "./document.js";
import type { Element } from "./parser.js";

/**
 * A node in the virtual document tree. Maps DOM structure to template
 * structure, carrying parser signals in context.
 */
export class VirtualNode {
  /** The DOM content: a TreeNode, ParagraphView, or Run. */
  readonly content: ContentNode;
  /** Parser-assigned tag ID. */
  id: number;
  /** The parser element, if the parser produced one at this position. */
  element: Element | null;
  /** Parent virtual node, or null for the root. */
  parent: VirtualNode | null;
  /** Child virtual nodes. */
  readonly children: VirtualNode[];

  constructor(opts: {
    content: ContentNode;
    id: number;
    element: Element | null;
    children: VirtualNode[];
  }) {
    this.content = opts.content;
    this.id = opts.id;
    this.element = opts.element;
    this.parent = null;
    this.children = opts.children;
    for (const child of this.children) {
      child.parent = this;
    }
  }
}
