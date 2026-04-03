# Codebase Overview

## Directory Structure

```
src/
├── template/          # Core parsing logic (tree-agnostic)
│   ├── tag.ts         # Tag interface, detectTags(), detectIsolatedTag()
│   ├── parser.ts      # Stack-based parser, Element/TagResult interfaces
│   ├── normaliser.ts  # Run normalization algorithm
│   ├── run.ts         # Abstract run operations (split/merge)
│   ├── tree-reader.ts # TreeNode abstraction, TreeReader class
│   ├── virtual-node.ts # VirtualNode (DOM-to-template mapping)
│   ├── paragraph-reader.ts # ParagraphView, ParagraphReader class
│   ├── hoist.ts       # BFS boundary detection, path validation, hoist
│   ├── operator.ts    # Operator enum, Literal enum
│   ├── expression.ts  # Expression interface, tokenizer, parseExpression()
│   ├── resolve.ts     # Pass 1: Resolver class, TypedElement, FunctionRegistry
│   ├── reference-map.ts # ReferenceMap class (scoped variable bindings)
│   └── analyse.ts     # Pass 2: resolveHint(), analyse() orchestrator
├── dom/               # Browser DOM implementation (docx-preview)
│   ├── node.ts        # DomNode (HTML element tree)
│   ├── run.ts         # DomRun (HTML span wrapper)
│   └── paragraph.ts   # DomParagraphView
├── docx/              # OOXML/XML implementation
│   ├── node.ts        # XmlNode (XML element tree)
│   ├── run.ts         # XmlRun (w:r XML element wrapper)
│   ├── paragraph.ts   # XmlParagraphView
│   └── document.ts    # readDocx() function
└── queue.ts           # Generic queue data structure
```

## Key Types

### Tag (`src/template/tag.ts`)
```ts
interface Tag {
  offset: number;
  length: number;
  head: string;
  params: string | null;
  isKeyword: boolean;
  raw: string;            // full matched text, e.g. "{{#if x}}"
}
```
Tag patterns matched: `/\{\{(#?\w+)(.*?)\}\}/g`

Both `detectTags` (inline scanning) and `detectIsolatedTag` (whole-paragraph match) live in `tag.ts`.

### Element (`src/template/parser.ts`)
```ts
interface Element {
  id: number;             // start tag's ID (blocks) or own ID (simple)
  tag: Tag;
  children: Element[];
}

interface TagResult {
  id: number;             // monotonically increasing per real tag; -1 for null
  element: Element | null;
}
```
`addTag` returns a `TagResult`. ID semantics:
- `(id: N, element: null)` — start tag, opened a scope.
- `(id: N, element: { id: N })` — simple element, self-referencing.
- `(id: N, element: { id: M })` — end tag (ID N), closing block started at ID M.
- `(id: -1, element: null)` — null tag (plain content), no parser tracking.

### VirtualNode (`src/template/virtual-node.ts`)
```ts
class VirtualNode {
  content: unknown;         // TreeNode | ParagraphView | Run
  id: number;               // parser tag ID, or -1 for untagged
  element: Element | null;  // parser signal, when applicable
  parent: VirtualNode | null;
  children: VirtualNode[];
}
```
Maps DOM structure to template structure. Produced by `TreeReader`
(tree level) and `ParagraphReader` (inline level). The `content`
field is the concrete DOM attachment point; `element` carries the
parser's contextual signal for that position. Parent references are
set by the constructor.

### TypedElement (`src/template/resolve.ts`)
```ts
interface TypedElement {
  operator: Operator | null;
  operands: TypedElement[];
  value: string | null;
  rule: TypeHint | null;       // APPLY nodes: param hint for right operand
  returnType: TypeHint | null; // outermost APPLY: function return type; literals: intrinsic type
}
```

### TypeHint / BaseType (`src/template/analyse.ts`)
```ts
interface TypeHint { strong: boolean; type: BaseType; }
type BaseType =
  | { kind: "string" }
  | { kind: "boolean" }
  | { kind: "number"; integer?: boolean }
  | { kind: "collection"; item?: TypeHint }
  | { kind: "structure"; properties: Map<string, TypeHint> };
```

### Abstract Hierarchies
- **Run** (abstract): text-bearing node (split/merge)
  - DomRun (HTML span wrapper)
  - XmlRun (w:r XML element wrapper)
- **TreeNode** (abstract): document tree node
  - DomNode (full projection of HTML element tree)
  - XmlNode (full projection of XML element tree)

## Architectural Patterns

**Dual implementation strategy**: both DOM (browser, interactive) and XML (OOXML, document creation) share the same template-level abstractions.

**Abstraction layers**:
1. `TreeNode` — abstract document tree interface
2. `ParagraphView` — abstract paragraph interface
3. `Run` — abstract text-bearing node interface
4. Concrete implementations per tree type (dom/, docx/)

**Tree regularisation pipeline** (`TreeReader` → `ParagraphReader` → `VirtualNode` → `hoist`):
- `TreeReader.classify(node)` recursively maps a `TreeNode` tree to a `VirtualNode` tree.
  - Isolated tag paragraphs: single `VirtualNode` with id/element populated.
  - Inline paragraphs: delegates to `ParagraphReader`, which maps each normalised run entry to a child `VirtualNode`.
  - Containers: recursed, producing nested `VirtualNode` subtrees.
- Both readers own a `Parser` instance. `ParagraphReader` handles inline scope; `TreeReader` handles tree-level scope and splices paragraph-level elements via `addCollection`.
- `result()` on either reader validates scope closure and returns the `Element` tree.
- `findBoundaries` performs BFS over the `VirtualNode` tree, matching start/end boundary pairs with a per-level stack. Enforces equal depth (invariant #1) and correct nesting order.
- `hoist` walks each boundary pair toward the lowest common ancestor via parent pointers, checking DOM tag equality (invariant #2) at each step, then copies id and element onto the ancestor-level endpoint nodes.

**Other algorithms**:
- Tag detection: regex-based in-order text scanning; `raw` field preserves matched text
- Run normalization: queue-based with split/merge operations
- Parsing: stack-based on-line parser with monotonic ID assignment
- Node projection: `DomNode` and `XmlNode` project every child element as a node (no transparent traversal); only paragraph detection is tag-specific
- Static analysis (two-pass):
  1. Resolution (`resolve.ts`): Expression → TypedElement with function signatures
  2. Type hinting (`analyse.ts`): top-down hint propagation, variable binding via ReferenceMap
- Element-level orchestration (`analyse.ts`): drives both passes per element, handles `#each` scoping
