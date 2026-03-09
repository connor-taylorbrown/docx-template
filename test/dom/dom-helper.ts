import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
export const document = dom.window.document;

/** Create an HTML element with optional inner HTML. */
export function el(tag: string, html?: string): HTMLElement {
  const element = document.createElement(tag);
  if (html !== undefined) element.innerHTML = html;
  return element;
}

/** Create a <span> with text content and optional inline style. */
export function span(text: string, style?: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.textContent = text;
  if (style) s.setAttribute("style", style);
  return s;
}

/** Create a <p> and append children. */
export function p(...children: Node[]): HTMLParagraphElement {
  const para = document.createElement("p");
  for (const child of children) para.appendChild(child);
  return para;
}
