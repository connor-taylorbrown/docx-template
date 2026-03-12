import { readFileSync } from "node:fs";
import { detectTags } from "../src/template/tag.js";
import { DocumentNode } from "../src/template/document-node.js";
import { Parser, type Element } from "../src/template/parser.js";

class StubNode extends DocumentNode {}

export function parseFile(path: string): Element[] {
  const text = readFileSync(path, "utf-8");
  const tags = detectTags(text);
  const parser = new Parser();
  for (const tag of tags) {
    parser.addTag(new StubNode(), tag);
  }
  return parser.parse();
}
