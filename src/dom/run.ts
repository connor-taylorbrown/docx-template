import { Run } from "../template/run.js";

/**
 * Concrete Run backed by an HTML <span> element from docx-preview
 * output. Formatting lives in inline styles, preserved automatically
 * by cloneNode.
 */
export class DomRun extends Run {
  constructor(private readonly element: HTMLSpanElement) {
    super();
  }

  /** The underlying span element. */
  get el(): HTMLSpanElement {
    return this.element;
  }

  get length(): number {
    return (this.element.textContent ?? "").length;
  }

  split(offset: number): [DomRun, DomRun] {
    const text = this.element.textContent ?? "";
    const left = this.element.cloneNode(true) as HTMLSpanElement;
    const right = this.element.cloneNode(true) as HTMLSpanElement;
    left.textContent = text.slice(0, offset);
    right.textContent = text.slice(offset);
    return [new DomRun(left), new DomRun(right)];
  }

  merge(queue: Run[]): DomRun {
    const merged = this.element.cloneNode(true) as HTMLSpanElement;
    let text = merged.textContent ?? "";
    for (const run of queue) {
      if (!(run instanceof DomRun)) throw new Error("Expected DomRun");
      text += run.el.textContent ?? "";
    }
    merged.textContent = text;
    return new DomRun(merged);
  }
}
