import { Tag } from "./tag.js";

// --- Element type ---

export interface Element {
  tag: Tag;
  children: Element[];
}

// --- Parser ---

interface Scope {
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

  /** The children list of the current scope (or root if no open scope). */
  private current(): Element[] {
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1].children
      : this.root;
  }

  /**
   * Push a tag into the parser.
   * - null: no-op, returns null.
   * - #end keyword: closes current scope, returns the completed element.
   * - Other keyword: opens a new scope, returns null.
   * - Non-keyword: adds a simple element, returns it.
   */
  addTag(tag: Tag | null): Element | null {
    if (tag === null) return null;

    if (tag.head === "#end") {
      const scope = this.stack.pop();
      if (!scope) {
        throw new SyntaxError(`Unmatched {{#end}}`);
      }
      const element: Element = {
        tag: scope.tag,
        children: scope.children,
      };
      this.current().push(element);
      return element;
    } else if (tag.isKeyword) {
      this.stack.push({ tag, children: [] });
      return null;
    } else {
      const element: Element = { tag, children: [] };
      this.current().push(element);
      return element;
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
