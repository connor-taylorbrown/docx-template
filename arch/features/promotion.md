# Promotion

Promotion resolves the case where a block element's boundary tags appear inside nested containers rather than as siblings. The virtual node is created speculatively when the parser signals "start," then invalidated and hoisted through each container exit until the scope closes.

## Defence of the approach

There is one invalidation algorithm. It does not distinguish between open and close. The start tag, stored on the frame, is the sole flag: when set, the frame is opening a scope; when cleared, it is closing one. This means:

- **No distinct open/close protocols.** The same pop-check-record-hoist sequence runs for both. The only branching is which trace to append to and whether to check for commit.
- **Fail-fast by construction.** The speculative vnode is popped *before* checking its span. A non-empty span throws immediately&mdash;the boundary container held content beyond the tag. This is unconditional; there is no deferred validation.
- **Enforcement at traversal time.** Container tag names are recorded during invalidation. Trace comparison happens at commit time, when both traces have reached equal length. Mismatches throw with the exact level and tag names that diverge. This is strictly better than post-hoc validation over the virtual DOM, which would need to reconstruct the container hierarchy.
- **Parser signals and promotion are consolidated.** Receiving a parser "start" and receiving a promoted frame with tag set are the same event: a scope opening at this level. The walk handles both uniformly. The parser signal is the first emission; promotion re-emits at each container boundary.

## Concepts

### Speculative virtual node

When the parser signals scope open, the walk creates a virtual node in the current span. This vnode may or may not close at the same container level. If `#end` arrives at the same level, the vnode is committed with a prototype. If a container exits first, the vnode is invalidated and hoisted.

### Frame

Each open scope is represented by a frame on the walk's stack. A frame holds:

```
Frame:
  vnode: VirtualNode               // current speculative vnode
  tag: Tag | null                  // set → opening; null → closing
  openTrace: string[]              // container tags crossed on open side
  closeTrace: string[]             // container tags crossed on close side
  contentVNode: VirtualNode | null // stashed content (close side only)
  pendingTag: Tag | null           // start tag for prototype (close side only)
```

The `tag` field is the promotion node's signal. When set, the frame represents a scope being opened (or promoted open). When cleared, the frame represents a scope being closed (or promoted close).

### Close frame

When `#end` is found on a promoted scope, the content frame stays on the stack and a *close frame* is pushed on top. The close frame has `tag = null`, an empty speculative vnode, and inherits the open trace. This increases the stack depth, so the same container-exit detection catches it. The close frame's invalidation uses the identical algorithm as any open frame.

## Algorithm

### `openScope`

Called when the parser signals start (returns null).

```
openScope(tag: Tag):
  vnode = { prototype: null, span: [] }
  current().vnode.span.push(vnode)
  stack.push({
    vnode,
    tag,                  // tag set → opening
    openTrace: [],
    closeTrace: [],
    contentVNode: null,
    pendingTag: null,
  })
```

### `closeScope`

Called when the parser signals block close (returns Element with keyword tag).

```
closeScope(resultTag: Tag):
  frame = stack[top]

  if frame.openTrace.length == 0:
    // no promotion occurred — direct commit
    stack.pop()
    frame.vnode.prototype = createPrototype(frame.tag)
    return

  // close-side promotion: stash content, push close frame
  frame.contentVNode = frame.vnode
  frame.pendingTag = frame.tag
  frame.closed = true

  closeVNode = { prototype: null, span: [] }
  frame.vnode.span.push(closeVNode)       // inside content span, at #end position
  stack.push({
    vnode: closeVNode,
    tag: null,                             // tag cleared → closing
    openTrace: frame.openTrace,            // inherited
    closeTrace: [],
    contentVNode: frame.contentVNode,
    pendingTag: frame.pendingTag,
  })
```

### `invalidate`

One function. Called when a container exits and `stack.length > depthOnEntry`. Handles both open and close frames identically.

```
invalidate(containerNode: TreeNode):
  frame = stack.pop()
  vnode = frame.vnode

  // 1. pop the virtual node from its parent's span
  parent = current()
  parent.vnode.span.removeLast(vnode)

  // 2. guard: the popped vnode's span must be empty
  if vnode.span.length > 0:
    throw "Promoted element boundary must be sole occupant of its container"

  // 3. record the container tag
  containerTag = containerNode.containerTag()
  if frame.tag is not null:
    frame.openTrace.push(containerTag)
  else:
    frame.closeTrace.push(containerTag)

  // 4. check for commit (close side only)
  if frame.tag is null:
    if frame.closeTrace.length > frame.openTrace.length:
      throw "Close boundary crosses more containers than open boundary"
    if frame.closeTrace.length == frame.openTrace.length:
      validateTraces(frame.openTrace, frame.closeTrace)
      commit(frame)
      return

  // 5. hoist: new speculative vnode at parent level
  frame.vnode = { prototype: null, span: [] }
  current().vnode.span.push(frame.vnode)
  stack.push(frame)
```

### `commit`

Finalises a promoted scope. Called from `invalidate` when close traces match, or from `closeScope` when no promotion occurred.

```
commit(closeFrame: Frame):
  // the content frame is directly below on the stack
  contentFrame = stack.pop()
  contentFrame.contentVNode.prototype = createPrototype(contentFrame.pendingTag)
```

### `validateTraces`

```
validateTraces(openTrace: string[], closeTrace: string[]):
  for i in 0..<openTrace.length:
    if openTrace[i] != closeTrace[i]:
      throw "Promotion mismatch at level {i}: opened through '{openTrace[i]}'"
            + " but closed through '{closeTrace[i]}'"
```

### Integration in `visit`

```
visit(node):
  if node.isParagraph():
    tag = detectIsolatedTag(node.text())
    if tag:
      result = parser.addTag(node, tag)
      if result is null:
        openScope(tag)
      else if result.tag.isKeyword:
        closeScope(result.tag)
      else:
        current().vnode.span.push({ prototype: createPrototype(result.tag), span: [] })
    else:
      current().vnode.span.push(node)
      inlineParse(node)
  else:
    depth = stack.length
    for child in node.children():
      visit(child)
    while stack.length > depth:
      invalidate(node)
```

Containers are not span entries. They provide structure for the recursion. The container branch is recurse + invalidate&mdash;nothing else.

## Test plan

### Invalidation guard (sole-tag invariant)

1. **Empty speculative vnode** &mdash; `{{#if x}}` alone in a `<td>`. Container exits. Assert: speculative vnode's span is empty, invalidation proceeds.

2. **Content in boundary container** &mdash; `{{#if x}}` followed by `{{name}}` in the same `<td>`. Assert: throws on cell exit because the speculative vnode's span contains the `{{name}}` virtual node.

3. **Plain text in boundary container** &mdash; a plain paragraph followed by `{{#if x}}` in a `<td>`. Assert: throws because the speculative vnode's span contains the plain paragraph.

4. **Close-side guard** &mdash; `{{#end}}` shares a `<td>` with a plain paragraph. Assert: throws because the close frame's speculative vnode span is non-empty.

### Trace recording and comparison

5. **Single-level match** &mdash; open through `["td"]`, close through `["td"]`. Assert: traces match, commit succeeds.

6. **Multi-level match** &mdash; open through `["td", "tr"]`, close through `["td", "tr"]`. Assert: match.

7. **Tag name mismatch** &mdash; open through `["td"]`, close through `["th"]`. Assert: throws with mismatch error.

8. **Depth mismatch (close deeper)** &mdash; open through `["td"]`, close through `["td", "tr"]`. Assert: throws when close trace exceeds open trace length.

9. **Depth mismatch (open deeper)** &mdash; start inside `<tr><td>`, end at `<table>` level (not nested). Assert: open trace is `["td", "tr"]`, close trace is `[]`; traces never reach equal length. The content frame is committed directly by `closeScope` (open trace is non-empty but close frame... wait, `closeScope` checks `openTrace.length == 0` for direct commit). Actually, `closeScope` would push a close frame. At table exit, close frame is invalidated. closeTrace = `["table"?]` which exceeds... hmm.

   Revised: start inside `<tr><td>`, end directly at `<tr>` level (but outside any `<td>`). openTrace = `["td"]`. Close frame pushed. At `<tr>` exit: close frame invalidated, closeTrace = `["tr"]`. `["tr"]` length (1) == `["td"]` length (1) → compare. `"tr" != "td"` → throws mismatch. Correct.

### Full round-trips

10. **Table row promotion** &mdash; three sibling `<td>` cells in a `<tr>`: cell 1 has `{{#if x}}`, cell 2 has content, cell 3 has `{{#end}}`. Assert: committed virtual node at row level, span contains content paragraph. Cells 1 and 3 are not in the content span (containers aren't span entries).

11. **Nested container promotion** &mdash; `{{#each item in items}}` inside `<tr><td>`, content at `<table>` level, `{{#end}}` inside a parallel `<tr><td>`. Assert: openTrace = `["td", "tr"]`, closeTrace = `["td", "tr"]`. Match. Content span has the middle-row paragraphs.

12. **Symmetric different parents** &mdash; `{{#if x}}` in row 1 cell, `{{#end}}` in row 2 cell. Traces are `["td"]` on both sides. Assert: passes. Different row parents are permitted; traces compare container *types*, not identity.

13. **No promotion (flat block)** &mdash; `{{#if x}}`, content, `{{#end}}` all as sibling paragraphs. Assert: `openTrace` stays empty. `closeScope` commits directly. No close frame pushed.

### Close frame mechanics

14. **Close frame stack depth** &mdash; `{{#end}}` inside a `<td>` on a promoted scope. Assert: close frame is pushed, stack depth increases by 1 inside the container, container-exit detection fires.

15. **Close frame invalidation** &mdash; close frame is invalidated identically to an open frame: popped, span checked empty, tag recorded in closeTrace.

16. **Commit pops both frames** &mdash; after trace match, both the close frame and the content frame are removed from the stack. Stack depth returns to pre-scope level.

### Edge cases

17. **Adjacent promoted blocks** &mdash; two `#if` blocks in the same row, each spanning their own cells. Assert: both promote independently, both commit with correct traces.

18. **Nested promoted blocks** &mdash; outer `#if` promotes across cells, inner `#each` promotes across cells within the outer's content span. Assert: both promote correctly. Inner promotion is independent of outer.

19. **Promotion with inline collection** &mdash; the boundary container holds a paragraph with inline tags (not isolated, detected by `inlineParse`). Assert: throws because the speculative vnode's span is non-empty (the paragraph is a span entry).

20. **Zero-content promoted block** &mdash; `{{#if x}}` in cell 1, `{{#end}}` in cell 2 (no content cell between them). Assert: committed virtual node with empty content span. Traces match.
