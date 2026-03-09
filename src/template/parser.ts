import { Tag } from "./tag.js";

// --- Element types ---

export interface SimpleElement<N> {
  kind: "simple";
  tag: Tag;
  node: N;
}

export interface BlockElement<N> {
  kind: "block";
  openTag: Tag;
  openNode: N;
  closeNode: N;
  children: Element<N>[];
}

export type Element<N> = SimpleElement<N> | BlockElement<N>;

// --- Parser ---

interface Scope<N> {
  tag: Tag;
  node: N;
  children: Element<N>[];
}

/**
 * On-line, stack-based scope tracker. Builds an element tree from a
 * stream of tag nodes and element collections.
 *
 * Generic over node type N (Run for inline, paragraph node for multi-line).
 */
export class Parser<N> {
  private readonly root: Element<N>[] = [];
  private readonly stack: Scope<N>[] = [];

  /** The children list of the current scope (or root if no open scope). */
  private current(): Element<N>[] {
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
  addTag(node: N, tag: Tag): void {
    if (tag.head === "#end") {
      const scope = this.stack.pop();
      if (!scope) {
        throw new SyntaxError(`Unmatched {{#end}}`);
      }
      const block: BlockElement<N> = {
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
  addCollection(elements: Element<N>[]): void {
    this.current().push(...elements);
  }

  /**
   * Finalise parsing. Returns the root scope's children.
   * Throws if any scopes remain open.
   */
  parse(): Element<N>[] {
    if (this.stack.length > 0) {
      const unclosed = this.stack[this.stack.length - 1];
      throw new SyntaxError(
        `Unclosed block {{${unclosed.tag.head}}}`,
      );
    }
    return this.root;
  }
}
