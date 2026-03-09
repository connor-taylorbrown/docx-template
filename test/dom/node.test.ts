import { describe, it, expect } from "vitest";
import { DomNode } from "../../src/dom/node.js";
import { document, span } from "./dom-helper.js";

/** Create an element with tag name and append children. */
function el(tag: string, ...children: Node[]): Element {
  const e = document.createElement(tag);
  for (const child of children) e.appendChild(child);
  return e;
}

/** Create a <p> with span children. */
function para(text: string): Element {
  const p = document.createElement("p");
  p.appendChild(span(text));
  return p;
}

function node(element: Element): DomNode {
  return new DomNode(element);
}

describe("DomNode", () => {
  describe("isParagraph", () => {
    it("<p> is a paragraph", () => {
      expect(node(para("Hi")).isParagraph()).toBe(true);
    });

    it("<article> is not a paragraph", () => {
      expect(node(el("article")).isParagraph()).toBe(false);
    });

    it("<td> is not a paragraph", () => {
      expect(node(el("td")).isParagraph()).toBe(false);
    });
  });

  describe("text", () => {
    it("extracts text from paragraph", () => {
      expect(node(para("Hello")).text()).toBe("Hello");
    });

    it("multiple spans", () => {
      const p = document.createElement("p");
      p.appendChild(span("Hel"));
      p.appendChild(span("lo"));
      expect(node(p).text()).toBe("Hello");
    });
  });

  describe("children", () => {
    it("article with paragraphs", () => {
      const root = el("article", para("a"), para("b"));
      const children = node(root).children();
      expect(children).toHaveLength(2);
      expect(children[0].isParagraph()).toBe(true);
      expect(children[1].isParagraph()).toBe(true);
    });

    it("table structure — transparent through table and tr", () => {
      const root = el("article",
        el("table",
          el("tr",
            el("td", para("cell")),
          ),
        ),
      );
      const children = node(root).children();
      // article sees td (via transparent traversal through table, tr)
      expect(children).toHaveLength(1);
      expect(children[0].isParagraph()).toBe(false);
      // td > p
      const tdChildren = children[0].children();
      expect(tdChildren).toHaveLength(1);
      expect(tdChildren[0].isParagraph()).toBe(true);
      expect(tdChildren[0].text()).toBe("cell");
    });

    it("text box — transparent through svg, g to foreignObject", () => {
      const fo = el("foreignObject", para("text box"));
      const root = el("article",
        el("div",
          el("svg",
            el("g", fo),
          ),
        ),
      );
      const children = node(root).children();
      expect(children).toHaveLength(1);
      // foreignObject is a container
      expect(children[0].isParagraph()).toBe(false);
      const foChildren = children[0].children();
      expect(foChildren).toHaveLength(1);
      expect(foChildren[0].text()).toBe("text box");
    });

    it("mixed paragraphs and containers", () => {
      const root = el("article",
        para("before"),
        el("table", el("tr", el("td", para("cell")))),
        para("after"),
      );
      const children = node(root).children();
      expect(children).toHaveLength(3);
      expect(children[0].isParagraph()).toBe(true);
      expect(children[0].text()).toBe("before");
      expect(children[1].isParagraph()).toBe(false); // td
      expect(children[2].isParagraph()).toBe(true);
      expect(children[2].text()).toBe("after");
    });

    it("header and footer as containers", () => {
      const section = el("section",
        el("header", para("head")),
        el("article", para("body")),
        el("footer", para("foot")),
      );
      const children = node(section).children();
      // section is transparent; header, article, footer are containers
      expect(children).toHaveLength(3);
      expect(children[0].children()[0].text()).toBe("head");
      expect(children[1].children()[0].text()).toBe("body");
      expect(children[2].children()[0].text()).toBe("foot");
    });

    it("paragraph returns no children", () => {
      expect(node(para("Hi")).children()).toEqual([]);
    });
  });

  describe("paragraphView", () => {
    it("returns a working ParagraphView", () => {
      const n = node(para("Hello"));
      const view = n.paragraphView();
      expect(view.text()).toBe("Hello");
      expect(view.runs()).toHaveLength(1);
    });
  });
});
