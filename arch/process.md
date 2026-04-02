# Template processing
A template is a document in any compatible format, containing tags in the expected syntax. Currently supported formats are:
- OOXML for rendering directly to docx output;
- HTML DOM as produced by `docx-preview` v0.3.7, for interactive rendering; and
- Plain text for testing.

## Parsing and analysis
Template processing proceeds in stages. The first two stages are necessary for all applications of the template system.
1. **Parsing:** Detects tags of the form `{{...}}` and constructs an element tree. Performs run normalisation for inline elements, and works in a single pass using an on-line algorithm.
   - *Usage notes:* Due to run normalisation, writing back the document tree to source after parsing may modify the file. These modifications will have performance benefits, as run normalisation is most efficient on normalised input.
   - *Future work:* Missing support for complex if-statements. A detailed implementation guide to this feature is found in Notes.
2. **Static analysis:** Inspects the element structure for variable usage patterns, identifying both type requirements and suggestions (*strong* and *weak typing*) for each variable. This process involves two passes over the element tree:
   1. **Function typing:** Tags contain expressions, which may invoke functions. The built-in function registry is consulted during this stage, to construct a valid type hinting structure for each expression.
   2. **Type detection:** Type binding is then performed for each variable, following the element and expression structure to examine usage.

These opening stages produce the following artifacts:
- *Normalised document:* The original document structure is modified to optimise future parsing rounds. Whereas parsing can be avoided by caching downstream artifacts, a modified source should invalidate the cache. Source modification will not, as a rule, completely reverse normalisation, so performance benefits remain even alongside caching.
  - **Recommendation:** Using content-based hashing to track document versions, instead of hashing the original document, hash the parser artifact.
- *Reference map:* Static analysis updates a key-value store of variable names to inferred types. As a read-only source, this store supports input validation during interactive rendering sessions. As a shared, writeable source, weak bindings may be accepted or modified. Second-pass analysis is ideally suited to validating these changes during an interactive session.
- *Template structure:* The analysis passes map from element to expression structure, which is a tree of variable, property, function and literal usages connected by operators. The rendering pipeline requires an element tree enriched with both render hints (available from stage 1 parsing), and expression structure. Template users also benefit from a logical structure view during interactive rendering sessions, as this shows which variable controls which elements, which can help explain why parts of the document are not rendering as expected.
  - **Implementation note:** The static analysis stage currently returns no output, while `analyse.ts` orchestrates the two phases in a single traversal of the element tree. This involves building `TypedElement` expression trees in phase 1, then hinting and binding with them for phase 2. **Recommendation:** Let `analyse` return a new `ReferenceElement` type:
    ```ts
    {
        element: Element,
        expression: Expression,
        children: ReferenceElement[]
    }
    ```
    This saves the result of expression parsing for future stages, and propagates the rendering hints provided on `Element` (namely the `nodes`). The intermediate artifacts necessary for type inference remain private to this stage. A clean separation between element and expression is warranted, as the renderer reduces expressions to values, but makes extensive and varied use of element structure.
    - **Side note:** This doesn't prejudice against the reuse of function typing artifacts internally. The interactive typing use-case would benefit from a cache keyed on expression strings.

## Rendering
Strictly speaking, rendering can happen without static analysis. However, as this stage orchestrates the parsing of expressions in the context of the element tree, and is required for good user experience with interactive rendering sessions, it is ideally suited to generating input for the rendering pipeline.
- **Note:** Bypassing static analysis would support a strictly more expressive templating system, giving us dynamic dispatch and computed property accessors, at a potentially serious cost not only to user experience in facing runtime errors, but also the security of their systems. Dynamic dispatch is an escape hatch from the built-in function registry, and as such should be strictly prohibited.

### Content detection
The renderer encompasses two major and only loosely related concerns: evaluating expressions, then modifying the DOM to reflect template instructions. The element tree is shaped in turn by both of these concerns, maintaining references to DOM nodes, and specifying scopes for variable declaration. While scoping elements like `#each` also function as containers, visibly repeating their contents, it is potentially desirable to support pure scoping elements like `#with`, which are completely invisible except for their effect on scoped expressions. Decoupling DOM manipulation from evaluation means stripping such elements out when they have served their purpose: the goal state is a renderable element tree consisting exclusively of container and content elements, with no variable content, and calculable positions.

To get to that goal state from static analysis output, we use the node bindings passed down from the parser stage, and do our best to ignore the scope concern until the last moment. We begin by traversing the `ReferenceElement` structure as though it were a container tree:
- `buildContainer`: recursing on container nodes, identify and preprocess all content.
- `gatherContent`: look through scope nodes to find content, which includes nested containers.

**What is a container?**
- Only elements with `#if` or `#each` tags are containers.

**What is a scope node?**
- Any other keyword element is a (pure) scope node.

**What does `buildContainer` do?**
- This function orchestrates a mapping between `ReferenceElement` and `RenderElement`, which tracks content offsets, container widths, and DOM references. This mapping is non-trivial, as offsets and widths are specified in terms of *the underlying DOM,* whose relationship with the element tree is complex.
- `ReferenceElement` contains DOM references in the form of `element.nodes`, which identify the boundaries of the element.
  - `RenderElement` boundaries should be DOM siblings, but `ReferenceElement` nodes may not be (see *Notes: Promoting boundary nodes*).
- The children of `ReferenceElement` may be a mix of leaf elements, containers, and pure scope blocks. This structure must be preserved for correct evaluation of expressions.
- However, `buildContainer` must calculate *content offsets,* treating the children of pure scope elements as its own children, in preparation for when these elements are collapsed.

#### Algorithm
Mutual recursion between `buildContainer` and `gatherContent` facilitates the mapping of trees, and the surfacing of content for offset calculation.
```
def buildContainer(element):
    -- Populate pseudo-children for offset calculation
    content := []
    children := element.children.map(e => gatherContent(content, e))

    ...

    return RenderElement(
        element: element.element,
        expression: element.expression,
        children
    )

def gatherContent(content, element):
    -- isKeyword implied, but always track nested container as content
    if isContainer(element):
        result := buildContainer(element)
        content.append(element)
    
    -- Passthrough with implicit base case (when children empty).
    else:
        result := RenderNode(
            element: element.element,
            expression: element.expression,
            children: element.children
                .map(e => gatherContent(content, e))
        )
    
    -- Simple elements are content
    if not isKeyword(element):
        content.append(result)

    return result
```

Having surfaced the content elements, the next task is to identify the position of these elements relative to the container, and the container width. In the simplest case, the container bounds a flat span of nodes that share a DOM parent. The indices of the nodes can then be identified in linear time, with the use of a queue. **FIFO behaviour is critical. Use `queue.ts`.**

Unfortunately, such an approach is not robust to the variety of DOM contexts in which elements may occur. In general, content nodes may be siblings or siblings of descendants. But iterating over node lists is a relatively expensive operation, so it is beneficial to reduce the problem to its simplest case, *by identifying groups of DOM siblings.* Performance is then bounded by the number of groups: $O(n)$ in the best case, $O(g \cdot n)$ in the worst.

An efficient grouping algorithm relies on the underlying DOM tree structure. Consider three elements ${a, b, c, d}$, where $parent(a) = parent(c) \neq parent(b)$. Because we can infer that $b$ is a descendant of some node previous to $c$, we know that it shares a group with no other element. We therefore track all groups in order of first member. When we find a node belongs to an earlier group than last seen, we know that subsequent groups are complete, and remove them from the tracking list.

We may make a further assumption: that the last node will match the first group. This is derived from the assertion that boundary nodes are siblings. It is therefore an error for the grouping algorithm to finish with more than one incomplete group.
```
nodes := [start(element), ...content.map(e => start(e)), end(element)]
groups := []
complete := []
for node in nodes:
    i := 0
    while i < groups.length 
        and dom_parent(groups[i][0]) != dom_parent(node):
        i += 1
    
    if i < groups.length:
        move(groups, i, complete) -- Pop complete groups into a list
        group = groups[i]
    else:
        group = []
    
    group.append(node)
```

The groups are now ready to be used for offset calculation. However, the incomplete group is special: it contains the boundary nodes, and as such, we want relative rather than absolute offsets. The first offset is then 0, while the last is width. Example function signature:
```ts
function calculateOffsets(
    group: Node[],      // Uses Queue<Node> internally
    relative: boolean   // Subtract first offset if true
): number[]
```

We may normalise the handling of the incomplete group in the following way:
```
-- In buildContainer --
complete.append((groups.pop(), true)) -- where move sets (group, false)
if groups:
    throw Error() -- assert the boundary invariant

-- In new function --

g := 0
for group, relative in complete:
    for offset in calculateOffsets(group, relative):
        if relative and offset = 0: -- skip container start node
            continue
        
        if content.empty(): -- should find end node after last content
            return offset -- i.e. container width

        child := content.dequeue()
        child.offset := offset
        child.group := g
    
    g += 1
```

Tracking the group is essential for correct offset updating behaviour downstream. Due to the operation of this algorithm, group numbering is a reliable completion signal: when the current content group is greater than the last content group, no further offset propagation is necessary, and the group may be popped. Stated in terms of invariants: a group stack should be *monotonically decreasing.* A group is not completely handled until a higher numbered group is seen.

### Evaluation
The starting point of evaluation varies depending on the use case. For final document rendering, it is acceptable to traverse the element tree, evaluating all values before manipulating the DOM. For interactive rendering, this is only the *initial case:* subsequent renders must be reactive, and ideally surgical. This means tracking changes to variables, and triggering updates *only* on those elements and portions of the DOM that ought to be affected by them.

All necessary information for the initial render is contained in the `RenderElement` tree, produced by the content detection stage. 

## Notes
### Promoting boundary nodes
TODO

### Complex if-statements
TODO