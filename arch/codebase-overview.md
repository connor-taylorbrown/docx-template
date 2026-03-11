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
│   └── tree-reader.ts # TreeNode abstraction, TreeReader class
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
