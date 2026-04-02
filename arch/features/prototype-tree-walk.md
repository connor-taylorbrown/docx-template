# Prototype tree walk

Builds a virtual DOM from a document tree, linking virtual nodes to prototypes. The virtual DOM is a sparse overlay on the actual DOM: paragraph nodes and virtual nodes are span entries; containers provide traversal structure but are not span entries themselves. The parser serves as a signalling system: its on-line return values tell the walk when to open and close virtual nodes.

## Prototype interface

A prototype is a stateless evaluator and materialisation source. It holds a keyword and a parsed expression. It does not track children, instance state, or spans&mdash;those are virtual node concerns.

```ts
interface Prototype {
  /** The keyword operator (#if, #each, etc.), or null for simple value elements. */
  readonly keyword: Operator | null;

  /** Parsed expression for this element. */
  readonly expression: Expression;
}
```

For `#each`, the expression is the full `item in items` IN-expression. The renderer interprets the IN operator at render time. For `#if`, the expression is the condition. For simple elements, the expression is the value expression. Keyword-specific semantics are the renderer's concern; the prototype records which keyword is present (or null).

## Virtual node

A virtual node owns a contiguous span of DOM content. Its span contains paragraph nodes and nested virtual nodes interleaved in document order.

```ts
type SpanEntry = TreeNode | VirtualNode;

interface VirtualNode {
  /**
   * The prototype attached to this node, or null for the root.
   * When non-null, this virtual node represents a template element.
   */
  readonly prototype: Prototype | null;

  /**
   * The span: an ordered mix of paragraph nodes and nested virtual nodes.
   * For the root, this covers the entire document body.
   * For a block element, this is the internal content between boundary tags.
   * For a simple element, this is empty (the node itself is the content).
   */
  readonly span: SpanEntry[];
}
```

The root virtual node (`prototype: null`) spans the full document. Element virtual nodes replace a contiguous region of their parent's span. A simple element's virtual node has an empty span&mdash;the DOM node it occupies is its content, and there is nothing internal to it.

## Tree walk

### Contract changes

**`Parser.addTag` return value:** currently returns `void`. Must return `Element | null`:
- `null` when a keyword tag opens a new scope.
- `Element` when an element completes: simple (non-keyword) or block (`#end`).

Non-breaking: callers that ignore the return value are unaffected.

**`TreeNode.containerTag`:** new method. Returns the DOM tag name of a non-paragraph node (e.g. `"td"`, `"tr"`). Required for [promotion](promotion.md) trace comparison.

### External dependency contracts

**Parser** (modified):
- `addTag(node, tag): Element | null` &mdash; returns completed element or null on scope open.

**TreeNode** (extended):
- `children(): TreeNode[]` &mdash; child nodes in document order.
- `isParagraph(): boolean` &mdash; leaf classification.
- `text(): string` &mdash; concatenated text (paragraphs only).
- `paragraphView(): ParagraphView` &mdash; for inline parsing.
- `containerTag(): string` &mdash; DOM tag name (containers only). For promotion.

**InlineParser** (read-only):
- `(view: ParagraphView): Element[]` &mdash; inline tag detection and normalisation.

**Expression parser** (read-only):
- `parse(input: string): Expression` &mdash; from `expression.ts`.

**Tag** (read-only):
- `head: string`, `params: string | null`, `isKeyword: boolean`.

### Pseudocode

The walk uses a single `visit` function. Paragraphs are classified by tag detection; containers are traversed recursively. The container branch handles [promotion](promotion.md) on exit.

```
function buildVirtualDOM(root: TreeNode, parser: Parser, inlineParser): VirtualNode

  let rootVNode = { prototype: null, span: [] }
  let stack: Frame[] = [{ vnode: rootVNode, tag: null, ... }]

  current():
    return stack[stack.length - 1]

  function visit(node: TreeNode):
    if node.isParagraph():
      let tag = detectIsolatedTag(node.text())

      if tag:
        let result = parser.addTag(node, tag)

        if result is null:
          openScope(tag)

        else if result.tag.isKeyword:
          closeScope(result.tag)

        else:
          // simple element — leaf virtual node
          current().vnode.span.push({ prototype: createPrototype(result.tag), span: [] })

      else:
        // plain paragraph — content
        current().vnode.span.push(node)

        let elements = inlineParser(node.paragraphView())
        if elements.length > 0:
          parser.addCollection(elements)

    else:
      // container — recurse, then promote on exit
      let depth = stack.length
      for child in node.children():
        visit(child)
      while stack.length > depth:
        invalidate(node)

  // --- main ---
  for child in root.children():
    visit(child)

  parser.parse()  // validate no unclosed scopes
  return rootVNode
```

### Detecting block close

The walk distinguishes simple elements from block closes by checking `result.tag.isKeyword` on the returned element. The parser returns the *opening* keyword tag (`#if`, `#each`) for block closes, since that is what it stored on the scope. Simple elements have `isKeyword === false`.

### Key observations

1. The virtual node for a block element is pushed onto the stack *before* its internal content is visited. All paragraph nodes and nested virtual nodes encountered between open and close are naturally appended to its span.

2. Simple elements do not go on the stack&mdash;they are leaf virtual nodes with empty spans, appended directly to the current span.

3. The parser is only consulted for isolated tags. Its return value is a signal: null means "scope opened," Element means "element completed." The walk does not inspect the element tree structure.

4. `parser.parse()` at the end is a validation step only (unclosed scope detection). The virtual DOM is already built.

5. Containers are not span entries. They provide the recursive structure for traversal and the depth tracking for promotion. The actual DOM retains the full container hierarchy; the virtual DOM overlays dynamic content.

### Promotion

When a block element's boundary tags appear inside nested containers (e.g. table cells), the boundary nodes are not siblings. The walk detects this at container exit via the stack depth check and resolves it through the promotion protocol&mdash;a single invalidation algorithm that handles both open and close sides.

Full protocol, pseudocode, and test plan: **[promotion.md](promotion.md)**.

### `createPrototype`

```
function createPrototype(tag: Tag): Prototype
  let keyword = tag.isKeyword ? keywordOperator(tag.head) : null
  let exprInput = tag.isKeyword ? tag.params : tag.head + (tag.params ? " " + tag.params : "")
  return { keyword, expression: expressionParse(exprInput) }
```

`keywordOperator` maps `"#if"` &rarr; `Operator.IF`, `"#each"` &rarr; `Operator.EACH`, etc.

## Test plan

Tests validate the tree walk in isolation from rendering. The existing test infrastructure (`TestRun`, `DocumentNode` subclasses) provides concrete tree nodes. Promotion tests are in [promotion.md](promotion.md).

### Unit: createPrototype

1. **Simple element** &mdash; tag `{ head: "name", params: null, isKeyword: false }`. Assert: keyword is null, expression is a leaf with value `"name"`.
2. **Simple with params** &mdash; tag `{ head: "item", params: ".price", isKeyword: false }`. Assert: expression parses `"item.price"` (DOT operator).
3. **#if** &mdash; tag `{ head: "#if", params: "active", isKeyword: true }`. Assert: keyword is `Operator.IF`, expression is leaf `"active"`.
4. **#each** &mdash; tag `{ head: "#each", params: "item in items", isKeyword: true }`. Assert: keyword is `Operator.EACH`, expression is IN-expression.

### Integration: buildVirtualDOM

5. **Empty document** &mdash; root with no children. Assert: root span is empty.
6. **Plain paragraphs** &mdash; two paragraphs, no tags. Assert: root span has two TreeNode entries.
7. **One simple element** &mdash; `{{name}}`. Assert: root span has one VirtualNode (keyword null, expression `"name"`), empty inner span.
8. **One #if block** &mdash; `{{#if active}}`, `{{name}}`, `{{#end}}`. Assert: root span has one VirtualNode with keyword `Operator.IF`. Inner span has one VirtualNode (simple element).
9. **One #each block** &mdash; `{{#each item in items}}`, `{{item.name}}`, `{{#end}}`. Assert: root span has one VirtualNode with keyword `Operator.EACH`, IN-expression. Inner span has one VirtualNode (DOT expression).
10. **Nested blocks** &mdash; #each containing #if. Assert: outer VirtualNode's span contains the #if VirtualNode, which contains the leaf.
11. **Siblings** &mdash; `{{a}}` then `{{b}}`. Assert: root span has two VirtualNode entries in order.
12. **Interleaved** &mdash; plain paragraph, `{{name}}`, plain paragraph. Assert: root span is [TreeNode, VirtualNode, TreeNode].
13. **Container traversal** &mdash; table containing `{{name}}` in a cell. Assert: root span contains the VirtualNode only (containers are not span entries).

### Parser signalling

14. **Unclosed scope** &mdash; `{{#if x}}` with no `{{#end}}`. Assert: `parser.parse()` throws.
15. **Unmatched #end** &mdash; `{{#end}}` with no preceding keyword. Assert: `parser.addTag` throws.
16. **Inline collection** &mdash; paragraph with two inline tags. Assert: elements pass through `addCollection`; paragraph TreeNode is in span.

### Structural property

17. **Span completeness** &mdash; for any document tree, every non-tag paragraph TreeNode appears in exactly one virtual node's span. Verify by collecting all TreeNode entries across spans and comparing against a filtered flat traversal.
