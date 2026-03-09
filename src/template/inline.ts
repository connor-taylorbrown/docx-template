import { Run } from "./run.js";
import { detectTags } from "./tag.js";
import { normalise } from "./normaliser.js";
import { Parser, Element } from "./parser.js";

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
 * Inline parser orchestrator. Detects tags, normalises runs, feeds the
 * parser, and returns the resulting element children.
 */
export function parseInline(view: ParagraphView): Element<Run>[] {
  const tags = detectTags(view.text());
  if (tags.length === 0) return [];

  const entries = normalise(view.runs(), tags);
  view.replaceChildren(entries.map((e) => e.content));

  const parser = new Parser<Run>();
  for (const { tag, content } of entries) {
    if (tag) {
      parser.addTag(content, tag);
    }
  }
  return parser.parse();
}
