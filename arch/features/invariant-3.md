# Invariant #3: node text matches raw tag

**Depends on:** [template-rework.md](template-rework.md) — `ContentNode`
interface (`text()`, `tagName()`), `Element` restructuring, and folder
layout must land first. This feature is purely additive on that foundation.

## Summary

The tree-regularisation design specifies three rendering invariants for block
element boundary paths. Invariant #2 (DOM tag equality) is enforced by
`hoistPair`; invariant #3 (node text matches raw tag text) is not. Two
oversights contributed to this gap:

1. **Missing raw tag text on `Element`.** The design specifies that boundary
   node text is checked against the raw tag, but the parser discards raw
   text after matching. The start tag's raw text is accessible (via
   `element.tag` today, or `element.keyword`/`element.expression` after
   the rework), but there is no stored reference for the end boundary, and
   reconstructing raw text from parsed fields is fragile. The fix is a
   `tags: string[]` field on `Element`, populated with the raw text of
   each tag at element creation time — one entry for simple elements, two
   for block elements.

2. **Untyped `VirtualNode.content`.** The field was `unknown`, with no
   type-safe way to read boundary node text or DOM tag names. Resolved by
   the template rework, which introduces `ContentNode` with `text()` and
   `tagName()`, and types `VirtualNode.content` accordingly.

## Justification

Invariants #1 and #2 are structural: they guarantee that boundary nodes
occupy symmetric positions in the DOM and that their ancestor paths have
compatible tag names. But structural symmetry alone does not guarantee safe
rendering. Consider:

```
<tr><p>Hello</p><p>{{#if ...}}</p></tr>
<tr><p>{{#end}}</p></tr>
```

This template is grammatically valid (the parser accepts it), and both
invariants #1 and #2 are satisfied — the boundaries are at equal depth, and
the `<tr>` tags match along the path. But rendering this template would
require deleting the first `<tr>` and replacing it with the conditional
output. That silently destroys "Hello", which is not part of the template
expression and was never intended to be conditional.

Invariant #3 catches this: `innerText` on the start-side `<tr>` returns
`"Hello{{#if ...}}"`, which does not match the start tag's raw text
(`"{{#if ...}}"`). The mismatch proves that the boundary's ancestor contains
content beyond the tag — content that the renderer would have to discard. By
enforcing trimmed text equality at every level of the path, we guarantee
that each ancestor node is *exclusively owned* by the template tag, making
replacement safe. The comparison is whitespace-tolerant (trimmed) because
surrounding whitespace in DOM `innerText` is not visible after rendering and
does not represent meaningful content loss.

## Changes

All changes below are additive to the template rework.

### 1. `Element.tags`

Add `tags: string[]` to the `Element` interface. Populate it at element
creation time in `Parser.addTag`:

- **Simple element branch:** `tags: [tag.raw]` — one entry.
- **`#end` branch:** `tags: [scope.raw, tag.raw]` — start and end. Store
  `tag.raw` on `Scope` when opening a block so it is available at close.
- **Scope open:** no element created, so no change.

This is transparent to existing consumers: `tags` is additive and all
current `Element` construction sites are in `Parser.addTag`.

### 2. `hoistPair` enforcement

Invariant #3 is checked *during* the parent-walking loop, at the same sites
as invariant #2. At each level, the trimmed `text()` of the start-side and
end-side ancestors must equal the trimmed raw text of the start tag and end
tag respectively. This works because `text()` is recursive — a container's
text includes its children's text. If an ancestor contains any content
beyond the tag, its `text()` will exceed `raw`, and the mismatch is caught.

Checking the original boundary nodes is superfluous: if a leaf node's text
doesn't match its tag, the parent's text won't match either (since it
includes the leaf's text plus any sibling content, or equals it exactly).
The loop subsumes the leaf case.

- Start-side: `text().trim()` must equal `pair.element.tags[0].trim()`.
- End-side: `text().trim()` must equal `pair.element.tags[1].trim()`.

### 3. Replace `domTag` cast

The `domTag` helper in `hoist.ts` currently casts `content` to
`{ tag?: string }`. With `ContentNode` available from the rework, replace
this with a call to `content.tagName()`, removing the unsafe cast entirely.

## Pseudocode

```ts
function hoistPair(pair: BoundaryPair): void {
  let startNode = pair.start;
  let endNode = pair.end;
  const [startRaw, endRaw] = pair.element.tags.map(t => t.trim());

  while (startNode.parent !== endNode.parent) {
    const sp = startNode.parent;
    const ep = endNode.parent;
    if (!sp || !ep) {
      throw new SyntaxError("Block boundaries have no common ancestor");
    }

    // Invariant #2: DOM tags must match
    if (sp.content.tagName() !== ep.content.tagName()) {
      throw new SyntaxError(
        `Block boundary DOM tag mismatch: ` +
        `${sp.content.tagName()} vs ${ep.content.tagName()}`
      );
    }

    // Invariant #3: text must exclusively match raw tag
    if (sp.content.text().trim() !== startRaw) {
      throw new SyntaxError(
        "Block boundary contains content beyond the start tag"
      );
    }
    if (ep.content.text().trim() !== endRaw) {
      throw new SyntaxError(
        "Block boundary contains content beyond the end tag"
      );
    }

    startNode = sp;
    endNode = ep;
  }

  // Hoist: copy id and element onto ancestor-level nodes
  if (startNode !== pair.start) {
    startNode.id = pair.start.id;
    startNode.element = pair.start.element;
  }
  if (endNode !== pair.end) {
    endNode.id = pair.end.id;
    endNode.element = pair.element;
  }
}
```

## Test plan

Tests are grouped by concern. All tests use `hoistPair` via `hoist`
(called on the output of `findBoundaries`). Test helpers need a `text`
field on content labels, returned by `ContentNode.text()`.

### Parser: `Element.endTag`

| # | Case | Expectation |
|---|------|-------------|
| P1 | Simple element | `element.tags` is `["{{name}}"]` |
| P2 | Block element | `element.tags` is `["{{#if x}}", "{{#end}}"]` |
| P3 | Existing parser tests | Pass without modification |

### Invariant #3: text matches raw tag

| # | Case | Tree | Expectation |
|---|------|------|-------------|
| 3.1 | Exclusive ownership — pass | `root(container("td", {text:"{{#if x}}"}), container("td", {text:"{{#end}}"}))` | No throw |
| 3.2 | Start ancestor has extra content | `root(container("td", {text:"Hello{{#if x}}"}), container("td", {text:"{{#end}}"}))` | Throws |
| 3.3 | End ancestor has extra content | `root(container("td", {text:"{{#if x}}"}), container("td", {text:"{{#end}}Bye"}))` | Throws |
| 3.4 | Extra content at intermediate level | Two-level nesting; inner containers clean, outer start container text is `"Extra{{#if x}}"` | Throws |
| 3.5 | Whitespace-only surroundings — pass | `root(container("td", {text:" {{#if x}} "}), container("td", {text:" {{#end}} "}))` | No throw |
| 3.6 | Whitespace plus extra content — fail | `root(container("td", {text:" Hello {{#if x}} "}), container("td", {text:"{{#end}}"}))` | Throws |
| 3.7 | Siblings (no walk) — invariant not checked | Start and end are siblings under root; start text is `"Hello{{#if x}}"` | No throw (loop body never executes) |

### Invariant #2 × #3 interaction

| # | Case | Expectation |
|---|------|-------------|
| 3.8 | DOM tag mismatch caught before text check | `container("td", start)` vs `container("th", end)`, both with clean text | Throws DOM tag mismatch (invariant #2), not text mismatch |
| 3.9 | Existing invariant #2 and hoist-operation tests | Pass — update content labels to include valid `text` fields |

### Multi-level paths

| # | Case | Expectation |
|---|------|-------------|
| 3.10 | Two-level clean path | `root(c("div", c("td", start)), c("div", c("td", end)))` — all text exclusive | No throw; hoisted to `div` level |
| 3.11 | Clean inner, dirty outer | Inner containers have exclusive text; outer `div` text includes sibling content | Throws at outer level |
