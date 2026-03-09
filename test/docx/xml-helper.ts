import { DOMParser } from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const parser = new DOMParser();

/**
 * Parse an XML fragment with OOXML namespace declarations pre-applied.
 * Returns the first child element of the wrapper.
 */
export function parseXml(xml: string): Element {
  const wrapped = `<root xmlns:w="${W}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">${xml}</root>`;
  const doc = parser.parseFromString(wrapped, "text/xml");
  const root = doc.documentElement;
  for (let i = 0; i < root.childNodes.length; i++) {
    if (root.childNodes[i].nodeType === 1) {
      return root.childNodes[i] as Element;
    }
  }
  throw new Error("No element child found");

}

/**
 * Serialize an element back to XML string for assertion.
 */
export function serialize(el: Element): string {
  return el.toString();
}

/**
 * Extract concatenated text content from an element's w:t descendants.
 */
export function textOf(el: Element): string {
  const texts: string[] = [];
  const walk = (node: Node) => {
    if (
      node.nodeType === 1 &&
      (node as Element).localName === "t" &&
      (node as Element).namespaceURI === W
    ) {
      texts.push(node.textContent ?? "");
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    }
  };
  walk(el);
  return texts.join("");
}
