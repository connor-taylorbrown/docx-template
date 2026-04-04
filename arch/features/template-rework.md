# Template rework

Consolidation of three related concerns into a single structural change,
reducing follow-up rework.

## Motivation

The `template/` folder currently mixes three roles:

1. **DOM abstraction** — `TreeNode`, `ParagraphView`, `Run` define the
   read-only contract that `dom/` and `docx/` implement. These are scattered
   across `tree-reader.ts`, `paragraph-reader.ts`, and `run.ts`, co-located
   with internal machinery (`TreeReader`, `ParagraphReader`, normaliser
   coupling) that implementations should not see.

2. **Parsing** — `Tag` in `tag.ts` exists solely as a communication protocol
   between the `Reader` classes and `Parser`. Expression parsing is deferred
   to `analyse.ts`, which orchestrates `expression.ts::parse` per element —
   work the parser could encapsulate directly.

3. **Static analysis and rendering** — `analyse.ts`, `resolve.ts`,
   `reference-map.ts` are analysis concerns; rendering (future) is a
   separate consumer. Both depend on `TreeReader` output but not on each
   other.

These roles should be separated structurally.

## Changes

### 1. `template/document.ts` — DOM abstraction surface

Create `src/template/document.ts` as the single import for `dom/` and
`docx/` implementations. Contains:

- **`ContentNode`** (new) — interface with `text(): string` and
  `tagName(): string | null`.
- **`TreeNode`** (from `tree-reader.ts`) — abstract class,
  `implements ContentNode`. Add `abstract tagName(): string | null`.
- **`ParagraphView`** (from `paragraph-reader.ts`) — abstract class,
  `implements ContentNode`. Add `abstract tagName(): string | null`.
- **`Run`** (from `run.ts`) — abstract class, `implements ContentNode`.
  Add `abstract text(): string` and `abstract tagName(): string | null`.

All concrete implementations already have the underlying data for `text()`
and `tagName()`. This is the only file that `dom/` and `docx/` need to
import from `template/`.

### 2. Parser encapsulation — expression parsing at parse time

`Parser.addTag` currently stores a `Tag` on the scope and element. Instead,
it should parse the expression eagerly:

- **Scope** stores a nullable `keyword: string` (the `#`-prefixed head, or
  null for simple elements) and a required `expression: Expression`.
- **`Element`** gains `keyword` and `expression` fields in place of the
  current `tag: Tag` dependency. `Tag` remains as the Reader→Parser
  protocol but is no longer stored on output.
- **`Expression`** gains a `text(): string` method, returning the original
  text. For keyword tags, `expression.text()` is identical to `tag.params`.
  For simple elements, it is `tag.head` (or the full `head + params` form).

This removes the deferred `parse()` calls in `analyse.ts::analyse`, which
currently reconstructs expression text from `tag.head` and `tag.params`
before parsing. The parser does this once, at insertion time.

### 3. Merge `tag.ts` into `parser.ts`

After change 2, `Tag` is a communication protocol between the `Reader`
classes and `Parser.addTag`. It has no independent consumers. Merge
`tag.ts` (the `Tag` interface, `detectTags`, `detectIsolatedTag`) into
`parser.ts` to make this coupling explicit.

### 4. Folder restructuring

After changes 1–3, `template/` contains only the parsing pipeline:

| File | Role |
|------|------|
| `document.ts` | DOM abstraction contract |
| `parser.ts` | `Tag`, `Element`, `Parser` (+ expression delegation) |
| `expression.ts` | Expression tokenizer and parser |
| `operator.ts` | `Operator` and `Literal` enums |
| `normaliser.ts` | Run normalisation |
| `paragraph-reader.ts` | `ParagraphReader` (inline classification) |
| `tree-reader.ts` | `TreeReader` (tree classification) |
| `virtual-node.ts` | `VirtualNode` |
| `hoist.ts` | Boundary detection and hoisting |

Static analysis files move to `src/analysis/`:

| File | Role |
|------|------|
| `analyse.ts` | `analyse()` orchestrator |
| `resolve.ts` | `Resolver`, `TypedElement`, `FunctionRegistry` |
| `reference-map.ts` | `ReferenceMap` (scoped variable bindings) |

`src/rendering/` is created as an empty directory (or with a placeholder)
for the future rendering pipeline.

### 5. Simplify `analyse.ts`

With expression parsing moved into the parser (change 2), `analyse` no
longer calls `expression.ts::parse`. It receives `Element` values that
already carry a parsed `Expression` and a `keyword` discriminant, removing
the `tag.head`/`tag.params` reconstruction:

```ts
// Before (current)
const expr = parse(tag.head + (tag.params ? " " + tag.params : ""));

// After
const { expression, keyword } = element;
// expression is already parsed; keyword discriminates the branch
```

## End-to-end coverage assessment

The static analysis pipeline is `TreeReader` → `Parser` → `analyse`. There
is currently **no end-to-end test** covering this path. The two halves are
tested in isolation:

- `tree-reader.test.ts` calls `TreeReader.classify` and `result()`, then
  asserts on `element.tag.head` — verifying the parse tree shape, but never
  feeding it into `analyse`.
- `analyse.test.ts` constructs `Element` objects by hand via an `el()`
  helper that builds a `Tag` and skips the parser entirely. It then calls
  `expression.parse()` inline — duplicating work the parser will own after
  this rework.

This means the seam between parser output and analysis input is untested.
After this rework, the parser produces `Element` values with pre-parsed
`Expression` trees — if the expression text or keyword discriminant is
wrong, `analyse` will silently receive bad input. An end-to-end test suite
should be added to cover this.

## Test plan

### Unchanged test suites

| Suite | Reason |
|-------|--------|
| `expression.test.ts` | Tests `expression.parse()` directly. No contract change. |
| `normaliser.test.ts` | Tests run normalisation. No contract change. |
| `resolve.test.ts` | Tests `Resolver`. No contract change. |
| `reference-map.test.ts` | Tests `ReferenceMap`. No contract change. |
| `dom/*.test.ts` | Import paths change (`document.ts`), but contracts are identical. |
| `docx/*.test.ts` | Same as DOM. |

### `tag.test.ts` — import update only

`Tag`, `detectTags`, and `detectIsolatedTag` move to `parser.ts`. Update
imports. All assertions are unchanged — these functions are unmodified.

### `parser.test.ts` — mechanical translation

The parser's external contract changes: `Element` carries `keyword` and
`expression` instead of `tag`. Assertions translate mechanically using
`expression.text()`:

| Current assertion | New assertion |
|-------------------|---------------|
| `element.tag.head` (simple) | `element.expression.text()` |
| `element.tag.head` (keyword) | `element.keyword` |
| `element.tag.params` | `element.expression.text()` |
| `element.tag` identity (`toBe`) | Remove — `Tag` is no longer stored |

`expression.text()` is the bridge: it lets parser tests verify the
expression was captured correctly without duplicating expression parsing
tests. A parser test asserts `expression.text() === "name"`, not the shape
of the expression tree — that's expression.test.ts's job.

**Helper changes:**

```ts
// Before
function simple(head: string): Tag { ... }
function keyword(head: string): Tag { ... }

// After — unchanged, Tag is still the input protocol
// But assertions change from element.tag.head to element.keyword etc.
```

**Manual `Element` construction** (in `addCollection` and nesting tests)
needs updating. Introduce a helper:

```ts
function el(text: string, children: Element[] = []): Element {
  return {
    id: -1,
    keyword: null,
    expression: parse(text),
    children,
  };
}
```

### `paragraph-reader.test.ts` — same translation

Assertions on `element.tag.head` become `element.keyword` or
`expression.text()`. No structural changes to tests.

### `tree-reader.test.ts` — same translation

Assertions on `element.tag.head` become `element.keyword` or
`expression.text()`. The `TestTreeNode` and `TestParagraphView` helpers
gain `tagName()` (return null — not needed for these tests). `TestRun`
gains `text()` (already has a `text` field — expose it as a method).

### `analyse.test.ts` — simplification

The `el()` helper currently builds a `Tag` and relies on `analyse` to call
`expression.parse()`. After the rework, `el()` builds an `Element` with a
pre-parsed `Expression`:

```ts
// Before
function el(t: Tag, children: Element[] = []): Element {
  return { id: nextId++, tag: t, children };
}

// After — expression.text() replaces tag reconstruction
function el(
  keyword: string | null,
  expr: string,
  children: Element[] = [],
): Element {
  return {
    id: nextId++,
    keyword,
    expression: parse(expr),
    children,
  };
}
```

Call sites translate directly. The `tag()` helper is removed:

| Current | New |
|---------|-----|
| `el(tag("name"))` | `el(null, "name")` |
| `el(tag("#if", "active"), [...])` | `el("#if", "active", [...])` |
| `el(tag("#each", "item in items"), [...])` | `el("#each", "item in items", [...])` |

The `resolveHint` tests are unchanged — they already operate on
`TypedElement`, not `Element`.

### `hoist.test.ts` — content label update

Test helpers gain a `text` field on content labels to implement
`ContentNode.text()`, and `tagName()` maps to the existing `tag` field.
No structural changes to invariant #1 or #2 tests. (Invariant #3 tests
are covered by the [invariant-3 feature](invariant-3.md).)

### `test-run.ts` — add `text()` method

`TestRun` already stores text as a public field. Add:

```ts
text(): string { return this._text; }  // rename field to avoid clash
```

Add `tagName(): string | null { return null; }` to satisfy `ContentNode`.

### New: end-to-end test (`test/e2e-analysis.test.ts`)

Covers the full `TreeReader` → `analyse` pipeline using `TestTreeNode`:

| # | Case | Input | Expectation |
|---|------|-------|-------------|
| E1 | Simple element | `container(para("{{name}}"))` | `refs.get("name")` is weak string |
| E2 | `#if` block | `container(para("{{#if active}}"), para("{{x}}"), para("{{#end}}"))` | `active` is weak boolean, `x` is weak string |
| E3 | `#each` block | `container(para("{{#each item in items}}"), para("{{item.name}}"), para("{{#end}}"))` | `items` is strong collection with structure item |
| E4 | Nested blocks | `container(para("{{#each i in x}}"), para("{{#if i.active}}"), para("{{i.name}}"), para("{{#end}}"), para("{{#end}}"))` | `x` collection, item has `active` (boolean) and `name` (string) properties |
| E5 | Inline tags in `#if` | `container(para("{{#if show}}"), para("Hello {{name}} world"), para("{{#end}}"))` | `show` is boolean, `name` is string |
| E6 | Expression in simple element | `container(para("{{a + b}}"))` | `a` and `b` both weak string |
| E7 | Expression in `#if` | `container(para("{{#if a > b}}"), para("{{x}}"), para("{{#end}}"))` | `a` and `b` strong number |

These tests verify that the parser's expression parsing produces the same
analysis results that `analyse`'s own inline `parse()` calls produce today.

### Addendum: OOXML smoke test (`test/docx/smoke.test.ts`)

The DOM smoke test (`test/dom/smoke.test.ts`) covers `docx-preview →
DomNode → TreeReader → Element`. There is no equivalent for the OOXML
path. `docx/document.test.ts` tests `readDocx` in isolation (zip
extraction, component listing) but never feeds its output into
`TreeReader`.

Add `test/docx/smoke.test.ts` to cover `readDocx → XmlNode → TreeReader →
Element`, mirroring the DOM smoke test structure. Uses `buildDocx` from
`docx/document.test.ts` (extract to shared helper or inline).

| # | Case | Input | Expectation |
|---|------|-------|-------------|
| X1 | Simple tag | Single `<w:p>` with `<w:t>{{name}}</w:t>` | 1 element, `expression.text` is `"name"`, keyword is null |
| X2 | Block element | `{{#if show}}` / body / `{{#end}}` across paragraphs | 1 element, keyword `"#if"`, has children |
| X3 | Multi-component | Document body + header, each with a tag | Both components produce elements via separate `TreeReader` passes |

X1 and X2 are structural mirrors of the DOM smoke tests. X3 exercises
`readDocx`'s multi-component output, which has no DOM analogue (the DOM
path renders a single container).
