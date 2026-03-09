/**
 * Abstract Run class. Encapsulates split/merge operations over a single
 * text-bearing node, independent of tree type (XML vs. DOM).
 */
export abstract class Run {
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
