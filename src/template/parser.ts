import { Tag } from "./tag.js";
import { DocumentNode } from "./document-node.js";

// --- Element types ---

export interface SimpleElement {
  kind: "simple";
  tag: Tag;
  node: DocumentNode;
}

export interface BlockElement {
  kind: "block";
  openTag: Tag;
  openNode: DocumentNode;
  closeNode: DocumentNode;
  children: Element[];
}

export type Element = SimpleElement | BlockElement;

// --- Parser ---

interface Scope {
  tag: Tag;
  node: DocumentNode;
  children: Element[];
}

/**
 * On-line, stack-based scope tracker. Builds an element tree from a
 * stream of tag nodes and element collections.
 */
export class Parser {
  private readonly root: Element[] = [];
  private readonly stack: Scope[] = [];

  /** The children list of the current scope (or root if no open scope). */
  private current(): Element[] {
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1].children
      : this.root;
  }

  /**
   * Push an isolated tag with its node reference.
   * - #end keyword: closes current scope.
   * - Other keyword: opens a new scope.
   * - Non-keyword: adds a simple element to the current scope.
   */
  addTag(node: DocumentNode, tag: Tag): void {
    if (tag.head === "#end") {
      const scope = this.stack.pop();
      if (!scope) {
        throw new SyntaxError(`Unmatched {{#end}}`);
      }
      const block: BlockElement = {
        kind: "block",
        openTag: scope.tag,
        openNode: scope.node,
        closeNode: node,
        children: scope.children,
      };
      this.current().push(block);
    } else if (tag.isKeyword) {
      this.stack.push({ tag, node, children: [] });
    } else {
      this.current().push({ kind: "simple", tag, node });
    }
  }

  /**
   * Splice pre-parsed elements into the current scope.
   */
  addCollection(elements: Element[]): void {
    this.current().push(...elements);
  }

  /**
   * Finalise parsing. Returns the root scope's children.
   * Throws if any scopes remain open.
   */
  parse(): Element[] {
    if (this.stack.length > 0) {
      const unclosed = this.stack[this.stack.length - 1];
      throw new SyntaxError(
        `Unclosed block {{${unclosed.tag.head}}}`,
      );
    }
    return this.root;
  }
}
