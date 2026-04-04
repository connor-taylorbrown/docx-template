import { Expression, parse as parseExpression } from "./expression.js";

// --- Tag type ---

export interface Tag {
  /** Text offset within the paragraph's concatenated text. */
  offset: number;
  /** Length of the full tag string (including {{ }}). */
  length: number;
  /** Head word, e.g. "name" for {{name}}, "#if" for {{#if ...}}. */
  head: string;
  /** Parameters (raw string after head word), if any. */
  params: string | null;
  /** Whether this is a keyword tag (head starts with #). */
  isKeyword: boolean;
  /** The full matched tag string, e.g. "{{#if x}}". */
  raw: string;
}

const TAG_PATTERN = /\{\{(#?\w+)(.*?)\}\}/g;

export function detectTags(text: string): Tag[] {
  const tags: Tag[] = [];
  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(text)) !== null) {
    const head = match[1];
    const params = match[2].trim() || null;
    tags.push({
      offset: match.index,
      length: match[0].length,
      head,
      params,
      isKeyword: head.startsWith("#"),
      raw: match[0],
    });
  }
  TAG_PATTERN.lastIndex = 0;
  return tags;
}

const ISOLATED_PATTERN = /^\s*(\{\{(#?\w+)(.*?)\}\})\s*$/;

/**
 * Match trimmed paragraph text as exactly one tag. Whitespace-only
 * content surrounding the tag is not visible after rendering, so the
 * entire paragraph is owned by the tag.
 */
export function detectIsolatedTag(text: string): Tag | null {
  const match = ISOLATED_PATTERN.exec(text);
  if (!match) return null;
  const raw = match[1];
  const head = match[2];
  const params = match[3].trim() || null;
  return {
    offset: match.index,
    length: match[0].length,
    head,
    params,
    isKeyword: head.startsWith("#"),
    raw,
  };
}

// --- Element type ---

export interface Element {
  id: number;
  keyword: string | null;
  expression: Expression;
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
  keyword: string;
  expression: Expression;
  children: Element[];
}

/**
 * On-line, stack-based scope tracker. Builds an element tree from a
 * stream of tags and element collections. Parses expressions eagerly.
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
        keyword: scope.keyword,
        expression: scope.expression,
        children: scope.children,
      };
      this.current().push(element);
      return { id, element };
    } else if (tag.isKeyword) {
      const expression = parseExpression(tag.params ?? "");
      this.stack.push({ id, keyword: tag.head, expression, children: [] });
      return { id, element: null };
    } else {
      const text = tag.params ? `${tag.head} ${tag.params}` : tag.head;
      const expression = parseExpression(text);
      const element: Element = { id, keyword: null, expression, children: [] };
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
        `Unclosed block {{${unclosed.keyword}}}`,
      );
    }
    return this.root;
  }
}
