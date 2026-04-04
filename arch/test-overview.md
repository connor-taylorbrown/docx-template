# Test overview

330 tests across 19 files. All tests use Vitest. DOM tests run in jsdom.

## Pipeline coverage

```
Document tree
    │
    ▼
TreeReader.classify ──► VirtualNode tree    ──► findBoundaries / hoist
    │                                               (hoist.test.ts)
    ├─ detectIsolatedTag ──► Parser.addTag
    │   (tag.test.ts)         (parser.test.ts)
    │
    └─ ParagraphReader.classify
        │  (paragraph-reader.test.ts)
        ├─ detectTags ──► normalise ──► Parser.addTag
        │  (tag.test.ts)  (normaliser.test.ts)
        │
        ▼
    Element tree
        │
        ▼
    analyse ──► Resolver ──► resolveHint ──► ReferenceMap
    (analyse.test.ts)  (resolve.test.ts)       (reference-map.test.ts)
```

**End-to-end:** `e2e-analysis.test.ts` covers TreeReader → analyse (7 tests).
The DOM smoke test (`dom/smoke.test.ts`) covers docx-preview → DomNode →
TreeReader → Element output (2 tests).

## Test files

### Template core

| File | Tests | Covers | Notes |
|------|-------|--------|-------|
| `tag.test.ts` | 24 | `detectTags`, `detectIsolatedTag` | Tag detection from text. Imports re-exported from `parser.ts`. |
| `parser.test.ts` | 26 | `Parser.addTag`, `Parser.parse`, `Parser.addCollection` | IDs, return values, block nesting, error cases. Verifies `keyword`, `expression.text()` on Element output. |
| `normaliser.test.ts` | 16 | `normalise` | Run boundary alignment against tag offsets. All 10 open/close position combinations. |
| `paragraph-reader.test.ts` | 10 | `ParagraphReader.classify`, `ParagraphReader.result` | Inline classification, parent references, block structure. |
| `tree-reader.test.ts` | 15 | `TreeReader.classify`, `TreeReader.result` | Isolated tags, inline delegation, container recursion, parent references. |
| `hoist.test.ts` | 16 | `findBoundaries`, `hoist` | Invariant #1 (equal depth), #2 (DOM tag match), hoist operation. Invariant #3 placeholder pending. |
| `expression.test.ts` | 49 | `expression.parse` | Operator precedence, associativity, function application, literals, parentheses. |

### Static analysis

| File | Tests | Covers | Notes |
|------|-------|--------|-------|
| `analyse.test.ts` | 55 | `resolveHint`, `analyse` | Type hint propagation (arithmetic, logic, comparison, DOT, APPLY), keyword dispatch (#if, #each), scoping, error cases. |
| `resolve.test.ts` | 22 | `Resolver.resolve` | Expression → TypedElement mapping, function signature resolution, arity checks. |
| `reference-map.test.ts` | 23 | `ReferenceMap` | Binding, compatibility, scoped declaration, merge semantics. |

### DOM implementation

| File | Tests | Covers | Notes |
|------|-------|--------|-------|
| `dom/node.test.ts` | 12 | `DomNode` | isParagraph, text, children projection (tables, text boxes), paragraphView. jsdom. |
| `dom/paragraph.test.ts` | 7 | `DomParagraphView` | text, runs, replaceChildren. jsdom. |
| `dom/run.test.ts` | 11 | `DomRun` | length, split, merge, style preservation. jsdom. |
| `dom/smoke.test.ts` | 2 | docx-preview → DomNode → TreeReader | Full pipeline through docx-preview rendering. jsdom. |

### OOXML implementation

| File | Tests | Covers | Notes |
|------|-------|--------|-------|
| `docx/node.test.ts` | 11 | `XmlNode` | isParagraph (namespace-aware), text, children projection (tables, wrappers), paragraphView. |
| `docx/paragraph.test.ts` | 8 | `XmlParagraphView` | text (w:t extraction, rPr skipping), runs, replaceChildren. |
| `docx/run.test.ts` | 13 | `XmlRun` | length, split, merge across w:t nodes, formatting preservation. |
| `docx/document.test.ts` | 3 | `readDocx` | Zip extraction, multi-component reading, missing component handling. |

### End-to-end

| File | Tests | Covers | Notes |
|------|-------|--------|-------|
| `e2e-analysis.test.ts` | 7 | TreeReader → analyse | Simple, #if, #each, nested blocks, inline tags, expressions. Validates parser expression encapsulation produces correct analysis. |

## Coverage gaps

- **Rendering pipeline:** no tests yet — rendering is not implemented.
- **Invariant #3:** `hoist.test.ts` has a placeholder; enforcement pending
  the [invariant-3 feature](../arch/features/invariant-3.md).
- **`Expression.text()`:** tested indirectly via parser tests
  (`expression.text!()` assertions). No direct test of the non-enumerable
  property mechanism, but breakage would surface through parser tests.
- **`ContentNode.tagName()`:** tested indirectly through `hoist.test.ts`
  (invariant #2 uses `tagName()`), `dom/node.test.ts`, and
  `docx/node.test.ts`. No dedicated test of the interface method.
- **Cross-run tag normalisation in e2e:** the e2e tests use single-run
  paragraphs. The `tree-reader.test.ts` "inline tags split across runs"
  test covers this at the unit level.

## Test helpers

- **`test-run.ts`** — `TestRun`: concrete `Run` backed by a plain string.
  Used by normaliser, paragraph-reader, tree-reader, and e2e tests.
- **`TestParagraphView` / `TestTreeNode`** — defined locally in
  `tree-reader.test.ts` and `e2e-analysis.test.ts`. Duplicated; could be
  extracted if more test files need them.
