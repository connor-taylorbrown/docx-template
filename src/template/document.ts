/**
 * Read-only DOM abstraction surface. This is the single import needed
 * by dom/ and docx/ implementations from the template/ folder.
 */

// --- ContentNode ---

/**
 * Common interface for all DOM-wrapping content types.
 * Implemented by TreeNode, ParagraphView, and Run.
 */
export interface ContentNode {
  /** Visible text content, inclusive of children (like innerText). */
  text(): string;
  /** DOM element tag name, or null for nodes without one. */
  tagName(): string | null;
}

// --- TreeNode ---

/**
 * Abstract view of a document tree node. Leaf nodes are paragraphs;
 * non-leaf nodes are containers (body, table cell, etc.).
 * Implementations differ by tree type (XML vs. DOM).
 */
export abstract class TreeNode implements ContentNode {
  /** Child nodes in document order. Empty for paragraphs. */
  abstract children(): TreeNode[];

  /** Whether this node is a paragraph (leaf for classification). */
  abstract isParagraph(): boolean;

  /** Concatenated text content. Only valid for paragraphs. */
  abstract text(): string;

  /** DOM element tag name, or null. */
  abstract tagName(): string | null;

  /** Create a ParagraphView for inline parsing. Only valid for paragraphs. */
  abstract paragraphView(): ParagraphView;
}

// --- ParagraphView ---

/**
 * Abstract view over a paragraph node, independent of tree type (XML vs. DOM).
 */
export abstract class ParagraphView implements ContentNode {
  /** Concatenated text content of the paragraph. */
  abstract text(): string;

  /** DOM element tag name, or null. */
  abstract tagName(): string | null;

  /** The paragraph's runs, in document order. */
  abstract runs(): Run[];

  /** Replace the paragraph's children with the given runs. */
  abstract replaceChildren(runs: Run[]): void;
}

// --- Run ---

/**
 * Abstract Run class. Encapsulates split/merge operations over a single
 * text-bearing node, independent of tree type (XML vs. DOM).
 */
export abstract class Run implements ContentNode {
  /** Text content of this run. */
  abstract text(): string;

  /** DOM element tag name, or null. */
  abstract tagName(): string | null;

  /** Character length of this run's text content. */
  abstract get length(): number;

  /**
   * Split this run at a character offset, producing two runs.
   * The left run contains characters [0, offset), the right [offset, length).
   * Both runs preserve non-text attributes (e.g. formatting).
   */
  abstract split(offset: number): [Run, Run];

  /**
   * Merge a queue of runs into this run, combining text content.
   * Returns a single run owning the merged content.
   */
  abstract merge(queue: Run[]): Run;
}
