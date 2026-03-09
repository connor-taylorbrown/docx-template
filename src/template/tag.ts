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
    });
  }
  TAG_PATTERN.lastIndex = 0;
  return tags;
}
