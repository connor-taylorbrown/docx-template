import { Run } from "../template/run.js";
import { ParagraphView } from "../template/paragraph-reader.js";
import { XmlRun } from "./run.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * Concrete ParagraphView backed by a `w:p` XML element. Extracts
 * w:r children as XmlRun instances and supports replacing the
 * paragraph's run children after normalisation.
 */
export class XmlParagraphView extends ParagraphView {
  constructor(private readonly element: Element) {
    super();
  }

  text(): string {
    let result = "";
    const walk = (node: Node) => {
      if (
        node.nodeType === 1 &&
        (node as Element).localName === "t" &&
        (node as Element).namespaceURI === W
      ) {
        result += node.textContent ?? "";
      } else if (
        node.nodeType === 1 &&
        (node as Element).localName === "rPr" &&
        (node as Element).namespaceURI === W
      ) {
        // Skip run properties — no text content
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
      }
    };
    walk(this.element);
    return result;
  }

  runs(): Run[] {
    const result: XmlRun[] = [];
    for (let i = 0; i < this.element.childNodes.length; i++) {
      const child = this.element.childNodes[i];
      if (
        child.nodeType === 1 &&
        (child as Element).localName === "r" &&
        (child as Element).namespaceURI === W
      ) {
        result.push(new XmlRun(child as Element));
      }
    }
    return result;
  }

  replaceChildren(runs: Run[]): void {
    // Collect existing w:r elements to remove
    const toRemove: Element[] = [];
    for (let i = 0; i < this.element.childNodes.length; i++) {
      const child = this.element.childNodes[i];
      if (
        child.nodeType === 1 &&
        (child as Element).localName === "r" &&
        (child as Element).namespaceURI === W
      ) {
        toRemove.push(child as Element);
      }
    }
    for (const el of toRemove) {
      this.element.removeChild(el);
    }

    // Append new runs
    for (const run of runs) {
      if (!(run instanceof XmlRun)) throw new Error("Expected XmlRun");
      this.element.appendChild(run.el);
    }
  }
}
