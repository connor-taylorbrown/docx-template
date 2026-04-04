import { Run, ParagraphView } from "../template/document.js";
import { DomRun } from "./run.js";

/**
 * Concrete ParagraphView backed by an HTML <p> element from
 * docx-preview output. Collects <span> children as DomRun instances.
 */
export class DomParagraphView extends ParagraphView {
  constructor(private readonly element: HTMLParagraphElement) {
    super();
  }

  text(): string {
    return this.element.textContent ?? "";
  }

  tagName(): string | null {
    return this.element.tagName;
  }

  runs(): Run[] {
    const result: DomRun[] = [];
    for (const child of this.element.children) {
      if (child.tagName === "SPAN") {
        result.push(new DomRun(child as HTMLSpanElement));
      }
    }
    return result;
  }

  replaceChildren(runs: Run[]): void {
    // Remove existing span children
    const toRemove: Element[] = [];
    for (const child of this.element.children) {
      if (child.tagName === "SPAN") {
        toRemove.push(child);
      }
    }
    for (const el of toRemove) {
      this.element.removeChild(el);
    }

    // Append new runs
    for (const run of runs) {
      if (!(run instanceof DomRun)) throw new Error("Expected DomRun");
      this.element.appendChild(run.el);
    }
  }
}
