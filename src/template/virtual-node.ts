import type { Tag } from "./tag.js";
import type { Element } from "./parser.js";

/**
 * A node in the virtual document tree. Maps DOM structure to template
 * structure, carrying parser signals in context.
 */
export class VirtualNode {
  /** The DOM content: a TreeNode, ParagraphView, or Run. */
  readonly content: unknown;
  /** The tag at this position, if any. */
  readonly tag: Tag | null;
  /** The parser element, if the parser produced one at this position. */
  readonly element: Element | null;
  /** Child virtual nodes. */
  readonly children: VirtualNode[];

  constructor(opts: {
    content: unknown;
    tag: Tag | null;
    element: Element | null;
    children: VirtualNode[];
  }) {
    this.content = opts.content;
    this.tag = opts.tag;
    this.element = opts.element;
    this.children = opts.children;
  }
}
