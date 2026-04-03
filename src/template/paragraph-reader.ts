import { Run } from "./run.js";
import { detectTags } from "./tag.js";
import { normalise } from "./normaliser.js";
import { Parser, Element } from "./parser.js";
import { VirtualNode } from "./virtual-node.js";

/**
 * Abstract view over a paragraph node, independent of tree type (XML vs. DOM).
 */
export abstract class ParagraphView {
  /** Concatenated text content of the paragraph. */
  abstract text(): string;

  /** The paragraph's runs, in document order. */
  abstract runs(): Run[];

  /** Replace the paragraph's children with the given runs. */
  abstract replaceChildren(runs: Run[]): void;
}

/**
 * Classifies a paragraph's inline content into a VirtualNode tree.
 * Owns a Parser instance for scope tracking across inline tags.
 */
export class ParagraphReader {
  private readonly parser = new Parser();

  /**
   * Classify a paragraph view into a VirtualNode. Each normalised
   * entry becomes a child, with parser signals materialised in context.
   */
  classify(view: ParagraphView): VirtualNode {
    const tags = detectTags(view.text());

    if (tags.length === 0) {
      return new VirtualNode({
        content: view,
        id: -1,
        element: null,
        children: [],
      });
    }

    const entries = normalise(view.runs(), tags);
    view.replaceChildren(entries.map((e) => e.content));

    const children: VirtualNode[] = [];
    for (const { tag, content } of entries) {
      const { id, element } = this.parser.addTag(tag);
      children.push(
        new VirtualNode({
          content,
          id,
          element,
          children: [],
        }),
      );
    }

    return new VirtualNode({
      content: view,
      id: -1,
      element: null,
      children,
    });
  }

  /**
   * Finalise parsing. Returns the element tree. Throws on unclosed blocks.
   */
  result(): Element[] {
    return this.parser.parse();
  }
}
