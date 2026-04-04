## Prototyping
- Assumes regularised `VirtualNode` tree, with materialised, hoisted parser signals (see [tree regularisation doc](tree-regularisation.md)).
- Replaces *internal spans* with `VirtualNode` instances over those spans.
  - `element` is assigned from end node.
  - `id` is assigned from `element.id`.
  - Boundary nodes are excluded from the resulting tree, being used purely for matching and sourcing element information.
  - These "block" `VirtualNode`s have no underlying content.

### Implementation
Define a `SpanParser` class, which consumes an input queue (use `queue.ts`) and pushes to an output list.

Example usage:
```
-- Copy and update current node children in-place, to ensure valid replacement.
parser := SpanParser(children.splice(0))
parser.write(children)
```

Under the hood, `write` invokes a recursive descent parsing method `parse`, which consumes from the input queue as a crucial side-effect, and returns `VirtualNode`. The parsing method recognises two cases:
- No-op: either a `VirtualNode` has no element, or the element is already "prototyped", i.e. `node.id == node.element.id`. *On the first pass, this implies a simple element, but it also guarantees idempotence, so avoid statements that this is the "simple element case".*
- Prototype: on a start node (`node.id > -1 && node.element == null`), create a new `children` list. Until the end node (`node.element && node.element.id == start`), append `parse` to `children` (recursive descent). Return a new `VirtualNode` with `children`, setting `element` and `id` correctly. *Allow nullable `content` as these nodes have no underlying DOM.*

### Outcome
The prototyping stage will produce a fully instrumented virtual DOM for first-pass rendering, with all parser signals completely handled. As all references are copied from the original tree, the prototype tree walk may safely perform span parsing after child node traversal, avoiding reprocessing.

Structurally, there are three kinds of `VirtualNode` of relevance to rendering, that are either passed through or composed by the prototyping stage. These are:
- *Content nodes:* passed through, containing direct content with no element metadata.
- *Simple elements:* passed through, containing direct content *and* element metadata. This specifies an expression, with no keyword.
- *Block elements:* composed, containing element metadata with no direct content. This metadata specifies both a keyword and expression. The content of a block element is contained in its descendants.