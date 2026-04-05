---
status: "completed"
---
# Prototype tree

**Depends on:** hoisting (`hoist.ts`) — boundary pairs must be identified and
hoisted before prototyping. This feature is purely additive on that foundation.

## Summary

After hoisting, the virtual tree still contains flat sibling sequences where
start and end boundary nodes bracket a block element's content. The prototype
stage consumes these sequences and replaces each matched span with a single
`VirtualNode` whose children are the interior nodes. Boundary nodes are
consumed — they exist purely for matching and sourcing element metadata. The
result is a fully instrumented virtual DOM where all parser signals are
resolved into tree structure.

## Justification

Hoisting lifts parser signals to the correct tree level, but the signals
remain encoded as sibling markers. Downstream rendering expects a tree where
each block element is a single node whose descendants are its content — the
same nesting structure that the template author intended. Without prototyping,
the renderer would need to scan sibling lists for start/end pairs, duplicating
the parser's work and coupling rendering to the boundary encoding.

Prototyping also establishes three structurally distinct `VirtualNode` kinds
that the renderer can dispatch on without inspecting parser fields:

- **Content nodes:** no element metadata — plain document content.
- **Simple elements:** element metadata where `node.id === node.element.id` —
  a leaf expression with no keyword.
- **Block elements:** element metadata with a keyword — composed by
  prototyping, with content in descendants and no direct DOM content.

## Changes

### 1. `VirtualNode.content` becomes nullable

Block prototype nodes have no underlying DOM node. Change `content` from
`ContentNode` to `ContentNode | null`. The constructor already accepts an
options object, so the change is:

```ts
readonly content: ContentNode | null;
```

Existing construction sites all supply a `ContentNode` and are unaffected.
Downstream consumers that read `content` (e.g. `domTag` in `hoist.ts`) must
already handle the null `tagName()` case; with nullable content they must
also guard against the node itself being null.

### 2. `SpanParser` class

New class in `src/template/span-parser.ts`. Consumes a `Queue<VirtualNode>`
and pushes results to an output array.

**API:**

```ts
class SpanParser {
  constructor(input: VirtualNode[]);
  write(output: VirtualNode[]): void;
}
```

Usage at each tree level (called on every node with children, post-hoist):

```ts
const input = node.children.splice(0); // drain original array
const parser = new SpanParser(input);
parser.write(node.children);           // push results back
```

`write` invokes a recursive descent method `parse` in a loop until the queue
is drained:

- **No-op case:** the node has no element, or is already prototyped
  (`node.id === node.element.id`). Return it unchanged.
- **Prototype case:** the node is a start boundary (`node.id >= 0` and
  `node.element === null`). Create a new children list. Consume from the
  queue, recursively calling `parse` for each entry, until the matching end
  node is found (`node.element !== null` and `node.element.id === startId`).
  Return a new `VirtualNode` with `content: null`, `element` and `id`
  sourced from the end node, and the collected children.

The start node's `id` identifies the block; the end node carries the
`element`. Both boundary nodes are consumed and do not appear in the output.

### 3. Top-level integration

Add a `prototype` function that walks the tree and applies `SpanParser` at
each level. This runs after `hoist` in the pipeline:

```
tree-reader → findBoundaries → hoist → prototype
```

The walk is a simple post-order traversal: prototype children first (so inner
blocks are resolved before outer ones), then apply `SpanParser` to the
current node's children.

### 4. Parent pointer maintenance

`VirtualNode`'s constructor sets `child.parent = this` for each child. New
block prototype nodes must do the same. Since `SpanParser` constructs new
`VirtualNode` instances with the collected children, the constructor handles
this automatically. However, nodes that are reparented (moved from the
original children array into a prototype's children) will have their parent
updated by the new constructor call.

## Pseudocode

```ts
class SpanParser {
  private readonly queue: Queue<VirtualNode>;

  constructor(input: VirtualNode[]) {
    this.queue = new Queue(input);
  }

  write(output: VirtualNode[]): void {
    while (!this.queue.isEmpty()) {
      output.push(this.parse());
    }
  }

  private parse(): VirtualNode {
    const node = this.queue.dequeue();

    // No-op: content node, simple element, or already prototyped
    if (node.element !== null || node.id < 0) {
      return node;
    }

    // Prototype: start boundary — collect children until end
    const startId = node.id;
    const children: VirtualNode[] = [];

    while (!this.queue.isEmpty()) {
      const next = this.queue.next();
      if (next.element && next.element.id === startId) {
        // End boundary found — consume it, build prototype node
        const end = this.queue.dequeue();
        return new VirtualNode({
          content: null,
          id: end.element!.id,
          element: end.element,
          children,
        });
      }
      children.push(this.parse());
    }

    throw new SyntaxError("Unmatched start boundary in prototype stage");
  }
}

function prototype(root: VirtualNode): void {
  // Post-order: prototype children before current level
  for (const child of root.children) {
    prototype(child);
  }
  const input = root.children.splice(0);
  const parser = new SpanParser(input);
  parser.write(root.children);
}
```

## Test plan

Tests validate `SpanParser` and `prototype` in isolation from the full
pipeline. Test helpers reuse the existing `hoist.test.ts` builders (`start`,
`end`, `simple`, `plain`, `container`, `root`).

### SpanParser: basic cases

| # | Case | Input | Expectation |
|---|------|-------|-------------|
| S1 | Empty input | `[]` | Output is `[]` |
| S2 | Content nodes only | `[plain(), plain()]` | Passed through unchanged |
| S3 | Simple element | `[simple(tag)]` | Passed through unchanged |
| S4 | Single block | `[start(t), plain(), end(startId, t)]` | One prototype node; children = `[plain()]`; content is null; element from end |
| S5 | Block with no interior | `[start(t), end(startId, t)]` | One prototype node; children = `[]` |
| S6 | Adjacent blocks | Two start/end pairs in sequence | Two prototype nodes in output order |
| S7 | Nested blocks | Outer start, inner start/end, outer end | One prototype containing another prototype |
| S8 | Mixed content and block | `[plain(), start(t), simple(t2), end(startId, t), plain()]` | `[plain, prototype(simple), plain]` |

### SpanParser: idempotence

| # | Case | Input | Expectation |
|---|------|-------|-------------|
| S9 | Already-prototyped node | Node with `id === element.id` | Passed through unchanged (no-op path) |
| S10 | Double application | Run SpanParser on its own output | Output identical to first pass |

### SpanParser: errors

| # | Case | Input | Expectation |
|---|------|-------|-------------|
| S11 | Unmatched start | `[start(t), plain()]` — no end | Throws SyntaxError |

### prototype: tree integration

| # | Case | Tree | Expectation |
|---|------|------|-------------|
| T1 | Flat block | `root(start, plain, end)` | Root has one prototype child |
| T2 | Block inside container | `root(container("td", start, plain, end))` | Container's children prototyped; root unchanged |
| T3 | Nested blocks at same level | Inner block inside outer block, both at same tree level | Outer prototype contains inner prototype |
| T4 | Post-hoist block | Full pipeline: tree-reader → findBoundaries → hoist → prototype. Block boundaries in nested containers. | Hoisted boundaries correctly prototyped at ancestor level |
| T5 | No blocks | `root(plain(), simple(t))` | Tree unchanged |

### Structural properties

| # | Property | Expectation |
|---|----------|-------------|
| P1 | No boundary nodes survive | After prototype, no node has `id >= 0` with `element === null` (start markers) and no node has `element.id !== node.id` (end markers) |
| P2 | Element preservation | Every `Element` from the input tree appears on exactly one prototype or simple-element node in the output |
| P3 | Content preservation | Every content node (no element, `id < 0`) from the input appears in the output at the same relative order |
