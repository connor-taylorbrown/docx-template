I want to design a simple template system, built on the docx format. Important points:
- A docx file is a zip archive of XML documents, which I shall call *components*.
- Any component that renders in the final document may contain template tags, including the header, footer, document body, and text boxes.
- Each template tag must be completely specified in a single paragraph (i.e. `<w:p>...</w:p>`).
  - Inline tags are acceptable.
  - Tags appear in the editor (e.g. Word) as `{{...}}`.
  - A keyword tag is of the form `{{#<keyword> <params>}}`. Parameters are optional (e.g. `{{#end}}` is acceptable).
- A keyword tag must be matched to an `{{#end}}` tag, forming a *block element.* This contrasts with a *simple element,* containing no keyword.

From these points, I propose a logical template structure to facilitate surgical XML document updates.
- The template root has one or more components.
- The component has one or more elements. It owns an XML document.
  - Block elements are recursive: they may contain one or more elements.
- The element owns a subtree of the component document.
  - To simplify the ownership model, inline block elements are something of a special case. If a tag is not the only text in a paragraph, it is *inline.* If it is inline, its element must close within the immediate `w:p` XML element.
  - Inline elements own the inner text inclusive of their tags, and all intervening elements.
  - Multi-line elements own every XML element between their first and last paragraph, inclusive. *Flagging an assumption:* all of these elements are siblings in the original XML doc.

Working out ownership logically involves traversing the XML parse tree, identifying tags, then elements, then creating virtual parent nodes to encapsulate the ownership decision. Any failure at this stage surfaces naturally as a syntax error for the template. Critique this and offer a first pass plan.
