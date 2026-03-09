# docx-preview integration

Reference: [docx-preview v0.3.7](https://github.com/VolodymyrBaydalka/docxjs) (`docxjs` on GitHub).

## HTML output structure

docx-preview renders a DOCX file into a browser DOM tree. The overall structure:

```html
<div class="docx-wrapper">
  <section class="docx" style="...">       <!-- page -->
    <header>...</header>
    <article style="column-count: ...">     <!-- body content -->
      <p class="docx_normal">
        <span>Hello world</span>
      </p>
    </article>
    <footer>...</footer>
  </section>
</div>
```

## Element mapping

| DOCX concept | HTML element | Notes |
|---|---|---|
| Page | `<section class="docx">` | One per page; contains header, article, footer |
| Body content | `<article>` | Direct child of section |
| Header | `<header>` | Before article in section |
| Footer | `<footer>` | After article in section |
| Paragraph | `<p>` | Class `docx_{styleId}`, e.g. `docx_normal` |
| Run | `<span>` | Inline styles for formatting; `white-space: pre-wrap` |
| Table | `<table>` > `<tr>` > `<td>` | Standard HTML; cells contain `<p>` elements |
| Text box | `<svg>` > `<g>` > `<foreignObject>` | VML fallback path; body elements inside foreignObject |
| Drawing | `<div>` (inline-block) | Contains `<img>` |
| Tab stop | `<span class="docx-tab-stop">` | Special span |

## Classification for tree traversal

**Containers** (may contain paragraphs or nested containers):
- `article`, `header`, `footer`, `td`, `foreignObject`

**Paragraphs** (leaf nodes for classification):
- `p`

**Transparent** (traverse into children to find containers/paragraphs):
- `div.docx-wrapper`, `section`, `table`, `tr`, `svg`, `g`, `div` (drawings)

This mirrors the XML implementation's approach: containers and paragraphs are classified explicitly, everything else is traversed transparently.

## Run handling

Formatting is carried by inline `style` attributes on `<span>` elements, not by child elements (contrast with `w:rPr` in OOXML). This simplifies split/merge:
- `cloneNode(true)` preserves all styles automatically.
- Text manipulation uses the native DOM `Text` API.
- Superscript/subscript runs wrap text in `<sup>`/`<sub>` inside the span.

## Style classes

The default class prefix is `docx`. Style IDs are lowercased with spaces/dots replaced by hyphens:
- Paragraph styles: `docx_{styleId}` (e.g. `docx_heading1`)
- Character styles: `docx_{characterStyleId}` on spans
- Numbering: `docx-num-{id}-{level}` on paragraphs (note: hyphen separator)

## Text boxes

Modern DrawingML text boxes (`wsp`) are not directly supported by docx-preview. They fall through to the VML fallback via `mc:AlternateContent`. The VML path renders text boxes as:

```html
<div>
  <svg style="...">
    <g>
      <foreignObject width="100%" height="100%">
        <p class="docx_normal"><span>Content</span></p>
      </foreignObject>
    </g>
  </svg>
</div>
```

The `<foreignObject>` element contains normal body elements (paragraphs, tables), so it acts as a container in our tree traversal.
