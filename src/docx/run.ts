import { Run } from "../template/run.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Collect w:t elements from a w:r element in document order. */
function collectTextNodes(el: Element): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (
      child.nodeType === 1 &&
      (child as Element).localName === "t" &&
      (child as Element).namespaceURI === W
    ) {
      result.push(child as Element);
    }
  }
  return result;
}

/**
 * Concrete Run backed by a `w:r` XML element. Preserves formatting
 * (w:rPr) across split and merge operations by cloning the element
 * and manipulating its w:t text nodes.
 */
export class XmlRun extends Run {
  constructor(private readonly element: Element) {
    super();
  }

  /** The underlying XML element. */
  get el(): Element {
    return this.element;
  }

  get length(): number {
    return collectTextNodes(this.element).reduce(
      (sum, t) => sum + (t.textContent ?? "").length,
      0,
    );
  }

  split(offset: number): [XmlRun, XmlRun] {
    const left = this.element.cloneNode(true) as Element;
    const right = this.element.cloneNode(true) as Element;

    // Walk w:t nodes, trimming text on each side of the offset.
    let pos = 0;
    const leftTexts = collectTextNodes(left);
    const rightTexts = collectTextNodes(right);

    for (let i = 0; i < leftTexts.length; i++) {
      const text = leftTexts[i].textContent ?? "";
      const start = pos;
      const end = pos + text.length;

      if (offset <= start) {
        // Entirely in right half — remove from left
        leftTexts[i].textContent = "";
        // Right keeps full text
      } else if (offset >= end) {
        // Entirely in left half — remove from right
        rightTexts[i].textContent = "";
      } else {
        // Split point falls within this w:t
        leftTexts[i].textContent = text.slice(0, offset - start);
        rightTexts[i].textContent = text.slice(offset - start);
      }

      pos = end;
    }

    return [new XmlRun(left), new XmlRun(right)];
  }

  merge(queue: Run[]): XmlRun {
    const merged = this.element.cloneNode(true) as Element;
    const texts = collectTextNodes(merged);
    const last = texts[texts.length - 1];
    if (!last) throw new Error("Cannot merge into run with no w:t");

    let combined = last.textContent ?? "";
    for (const run of queue) {
      if (!(run instanceof XmlRun)) throw new Error("Expected XmlRun");
      for (const t of collectTextNodes(run.el)) {
        combined += t.textContent ?? "";
      }
    }
    last.textContent = combined;

    return new XmlRun(merged);
  }
}
