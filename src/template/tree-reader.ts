import { Tag } from "./tag.js";
import { DocumentNode } from "./document-node.js";
import { Parser, Element } from "./parser.js";
import { ParagraphView } from "./inline.js";

const ISOLATED_PATTERN = /^\s*\{\{(#?\w+)(.*?)\}\}\s*$/;

/**
 * Match trimmed paragraph text as exactly one tag. Whitespace-only
 * content surrounding the tag is not visible after rendering, so the
 * entire paragraph is owned by the tag.
 */
function detectIsolatedTag(text: string): Tag | null {
  const match = ISOLATED_PATTERN.exec(text);
  if (!match) return null;
  const head = match[1];
  const params = match[2].trim() || null;
  return {
    offset: match.index,
    length: match[0].length,
    head,
    params,
    isKeyword: head.startsWith("#"),
  };
}

/**
 * Abstract view of a document tree node. Leaf nodes are paragraphs;
 * non-leaf nodes are containers (body, table cell, etc.).
 * Implementations differ by tree type (XML vs. DOM).
 */
export abstract class TreeNode extends DocumentNode {
  /** Child nodes in document order. Empty for paragraphs. */
  abstract children(): TreeNode[];

  /** Whether this node is a paragraph (leaf for classification). */
  abstract isParagraph(): boolean;

  /** Concatenated text content. Only valid for paragraphs. */
  abstract text(): string;

  /** Create a ParagraphView for inline parsing. Only valid for paragraphs. */
  abstract paragraphView(): ParagraphView;
}

/**
 * Parses a single paragraph's inline content. Accepts a ParagraphView,
 * returns the resulting elements. Extracted as a type to enable
 * constructor injection and test mocking.
 */
export type InlineParser = (view: ParagraphView) => Element<DocumentNode>[];

/**
 * Recursive document tree reader. Traverses a document tree in order,
 * classifying each paragraph as either an isolated tag or inline-parsed
 * content, and feeding results to a stack-based parser to build the
 * element tree.
 */
export class TreeReader {
  private readonly parser: Parser<DocumentNode>;
  private readonly inlineParser: InlineParser;

  constructor(parser: Parser<DocumentNode>, inlineParser: InlineParser) {
    this.parser = parser;
    this.inlineParser = inlineParser;
  }

  /**
   * Recursively classify children of the given node.
   *
   * - Paragraph with isolated tag: push node and tag to parser.
   * - Other paragraph: perform inline parse, push node and resulting
   *   elements to parser. The inline parse may modify the paragraph
   *   tree (run normalisation).
   * - Container: recurse into children.
   */
  classify(node: TreeNode): void {
    for (const child of node.children()) {
      if (child.isParagraph()) {
        const tag = detectIsolatedTag(child.text());
        if (tag) {
          this.parser.addTag(child, tag);
        } else {
          const elements = this.inlineParser(child.paragraphView());
          if (elements.length > 0) {
            this.parser.addCollection(elements);
          }
        }
      } else {
        this.classify(child);
      }
    }
  }

  /**
   * Finalise parsing after the tree has been classified.
   * Returns the root element list. Throws on unclosed blocks.
   */
  result(): Element<DocumentNode>[] {
    return this.parser.parse();
  }
}
