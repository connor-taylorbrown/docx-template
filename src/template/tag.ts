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
}
