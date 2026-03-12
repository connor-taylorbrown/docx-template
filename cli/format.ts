import type { ReferenceMap, TypeBinding, BaseType, TypeHint } from "../src/template/analyse.js";

export function formatRefs(refs: ReferenceMap): string {
  const lines: string[] = [];
  for (const [name, binding] of refs.entries()) {
    lines.push(`${name}: ${formatBinding(binding)}`);
  }
  return lines.length ? lines.join("\n") : "(empty)";
}

function formatBinding(b: TypeBinding): string {
  const prefix = b.strong ? "" : "~";
  return prefix + formatType(b.type);
}

function formatType(t: BaseType): string {
  switch (t.kind) {
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "number":
      return t.integer ? "integer" : "number";
    case "collection":
      return t.item ? `collection<${formatHint(t.item)}>` : "collection";
    case "structure":
      return formatStructure(t.properties);
  }
}

function formatHint(h: TypeHint): string {
  const prefix = h.strong ? "" : "~";
  return prefix + formatType(h.type);
}

function formatStructure(props: Map<string, TypeHint>): string {
  const entries: string[] = [];
  for (const [key, hint] of props) {
    entries.push(`${key}: ${formatHint(hint)}`);
  }
  return `{ ${entries.join(", ")} }`;
}
