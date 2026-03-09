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

Working out ownership logically involves traversing the XML parse tree, identifying tags, then elements, then creating virtual parent nodes to encapsulate the ownership decision. Any failure at this stage surfaces naturally as a syntax error for the template.

## Assumptions and constraints

- **No cross-boundary blocks.** Multi-line block elements must open and close within sibling XML elements. Constructions that span into nested structures (e.g. across table cells) are forbidden. Template authors are assumed to be technical users.
- **No nested paragraphs.** `<w:p>` elements cannot nest per the OOXML spec. This guarantees that an in-order traversal of a paragraph's text nodes visits each character exactly once.

## Parsing strategy

Parsing proceeds in two phases: tag extraction (per-paragraph) and element tree construction (per-component).

### Tag extraction

For each paragraph in the component XML, perform an in-order traversal of text nodes to produce the concatenated text. This avoids run normalization—tags split across `<w:r>` runs are reconstructed naturally from the text content, without modifying the XML.

From the concatenated text, classify the paragraph:
1. **All-tag paragraph.** Strip whitespace and match against `{{#?...}}`. If matched, this paragraph is a candidate multi-line block boundary. Extract the head word (including `#` if present) and parameter list via capture groups.
2. **Inline-tag paragraph.** If not all-tag, scan for all `{{...}}` occurrences. Record each tag's text offset, length, head word, and parameters.
3. **No tags.** Skip for now—these paragraphs may still fall within a multi-line block's ownership range.

Each tag record captures enough information to determine its role in the element tree.

### Element tree construction

- **Inline parser:** runs eagerly, per-paragraph, as tags are extracted. Each inline block must open and close within the same `<w:p>`, so parsing is purely local.
- **Multi-line parser:** runs after the full component scan. Uses a stack to match `{{#keyword}}` boundaries to `{{#end}}` tags across paragraphs. Inline parse results from owned paragraphs become children in the element tree.

Errors (unmatched blocks, cross-boundary violations, malformed tags) surface as syntax errors with location information (component, paragraph index).
