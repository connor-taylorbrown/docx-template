# Codebase Overview

## Directory Structure

```
src/
├── template/          # Core parsing logic (tree-agnostic)
│   ├── tag.ts         # Tag detection and interface definition
│   ├── document-node.ts # Abstract base class for all nodes
│   ├── parser.ts      # Stack-based parser, Element interface
│   ├── inline.ts      # ParagraphView abstraction, parseInline()
│   ├── normaliser.ts  # Run normalization algorithm
│   ├── run.ts         # Abstract run operations (split/merge)
│   ├── tree-reader.ts # TreeNode abstraction, TreeReader class
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
}
```
Tag patterns matched: `/\{\{(#?\w+)(.*?)\}\}/g`

### Element (`src/template/parser.ts`)
```ts
interface Element {
  tag: Tag;
  nodes: [DocumentNode] | [DocumentNode, DocumentNode];
  children: Element[];
}
```
- Simple elements: single `DocumentNode`, no children.
- Block elements: two `DocumentNode` references, nested children.

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

### DocumentNode Hierarchy
- **DocumentNode** (base, abstract)
  - **Run** (extends DocumentNode): abstract text-bearing node
    - DomRun (HTML span wrapper)
    - XmlRun (w:r XML element wrapper)
  - **TreeNode** (extends DocumentNode): abstract tree node
    - DomNode (HTML element tree walker)
    - XmlNode (XML element tree walker)

## Architectural Patterns

**Dual implementation strategy**: both DOM (browser, interactive) and XML (OOXML, document creation) share the same template-level abstractions.

**Abstraction layers**:
1. `TreeNode` — abstract document tree interface
2. `ParagraphView` — abstract paragraph interface
3. `Run` — abstract text-bearing node interface
4. Concrete implementations per tree type (dom/, docx/)

**Algorithms**:
- Tag detection: regex-based in-order text scanning
- Run normalization: queue-based with split/merge operations
- Parsing: stack-based on-line parser for element tree
- Tree traversal: recursive document tree classification
- Static analysis (two-pass):
  1. Resolution (`resolve.ts`): Expression → TypedElement with function signatures
  2. Type hinting (`analyse.ts`): top-down hint propagation, variable binding via ReferenceMap
- Element-level orchestration (`analyse.ts`): drives both passes per element, handles `#each` scoping
