import { Tag } from "./tag.js";

// --- Element type ---

export interface Element {
  id: number;
  tag: Tag;
  children: Element[];
}

// --- Tag result ---

export interface TagResult {
  id: number;
  element: Element | null;
}

// --- Parser ---

interface Scope {
  id: number;
  tag: Tag;
  children: Element[];
}

/**
 * On-line, stack-based scope tracker. Builds an element tree from a
 * stream of tags and element collections.
 */
export class Parser {
  private readonly root: Element[] = [];
  private readonly stack: Scope[] = [];
  private nextId = 0;

  /** The children list of the current scope (or root if no open scope). */
  private current(): Element[] {
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1].children
      : this.root;
  }

  /**
   * Push a tag into the parser.
   * - null: no-op, returns { id, element: null }.
   * - #end keyword: closes current scope, returns { id, element }.
   * - Other keyword: opens a new scope, returns { id, element: null }.
   * - Non-keyword: adds a simple element, returns { id, element }.
   *
   * IDs increment monotonically. Block elements carry the start tag's ID.
   */
  addTag(tag: Tag | null): TagResult {
    if (tag === null) return { id: -1, element: null };
    const id = this.nextId++;

    if (tag.head === "#end") {
      const scope = this.stack.pop();
      if (!scope) {
        throw new SyntaxError(`Unmatched {{#end}}`);
      }
      const element: Element = {
        id: scope.id,
        tag: scope.tag,
        children: scope.children,
      };
      this.current().push(element);
      return { id, element };
    } else if (tag.isKeyword) {
      this.stack.push({ id, tag, children: [] });
      return { id, element: null };
    } else {
      const element: Element = { id, tag, children: [] };
      this.current().push(element);
      return { id, element };
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
