import { createInterface } from "node:readline";
import { parseFile } from "./parse.js";
import { resolve } from "./run.js";
import { formatRefs } from "./format.js";
import type { Element } from "../src/template/parser.js";

const files = new Map<string, Element[]>();

function load(path: string): Element[] {
  const cached = files.get(path);
  if (cached) return cached;
  const elements = parseFile(path);
  files.set(path, elements);
  return elements;
}

function handleCommand(input: string): string {
  const match = input.match(/^@(\S+)\s+(.+)$/);
  if (!match) {
    return "Usage: @<file> <command>\nCommands: resolve";
  }
  const [, path, command] = match;

  let elements: Element[];
  try {
    elements = load(path);
  } catch (e) {
    return `Error loading ${path}: ${(e as Error).message}`;
  }

  switch (command.trim()) {
    case "resolve": {
      try {
        const refs = resolve(elements);
        return formatRefs(refs);
      } catch (e) {
        return `Error: ${(e as Error).message}`;
      }
    }
    default:
      return `Unknown command: ${command}`;
  }
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

rl.prompt();
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) { rl.prompt(); return; }
  if (trimmed === "quit" || trimmed === "exit") { rl.close(); return; }
  console.log(handleCommand(trimmed));
  files.clear();
  rl.prompt();
});
