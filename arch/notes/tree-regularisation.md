## Tree regularisation
Rendering templates is a complex process. Rendering templates that are specified as embedded text in an XML document structure is strictly more complex. Add to that the idiosyncracies of the docx system (OOXML), and you wonder why you bothered with the task to begin with.

### Current capability
The `TreeReader` class already encapsulates some degree of complexity, traversing a document tree to find paragraph nodes, on which it performs tag detection. If the paragraph is an isolated tag, it submits this to the parser. Otherwise, it delegates to a `parseInline` function, which performs *run normalisation* before fully parsing the paragraph. This enforces the output invariant of one DOM node per tag, alongside the additional input constraint of one paragraph per inline element, enforced by `parse`.

Though `TreeReader` and its delegate have complete visibility into the connection between DOM and template structure, up to now they have been principally conceived as vehicles for feeding the parser. The `classify` method of `TreeReader` in fact returns no value, relying entirely on the side-effect of an online parsing algorithm. The parser's direct output is acceptable for template validation and deeper static analysis, but rendering requires a much more intimate acquaintance with the DOM than this output provides.

### Modifications
The `classify` method should be updated to function as a mapper between `TreeNode` and `VirtualNode`.
- `TreeNode`: a read-only abstract wrapper for concrete providers to implement. *Does not support recursion into paragraph nodes.*
- `VirtualNode`: a mutable signalling vector, owned by the rendering pipeline. `TreeReader.classify` becomes the first stage in this pipeline, with static analysis acting as a side process. *Should support recursion into paragraph nodes, as run normalisation is guaranteed.*

Presently, `parseInline` returns a list of elements, as befits its name&mdash;a parsing result, with a side-effect of run normalisation. To support the new emphasis on rendering, `parseInline` should become the `classify` method of a `ParagraphReader` class, mirroring `TreeReader`. The parser becomes an instance field, supporting a `result` method. Where `TreeReader` currently invokes `this.inlineParser`, a new `ParagraphReader` is instantiated instead.
- **NOTE:** The constructor of `TreeReader` is currently parameterised, though there is little benefit to this and it should be changed.

Having rearchitected `parseInline` into a class, we may then replace the mutation of the `view` node with a more useful mapping between DOM and template structure. The `normalise` function already outputs a pair of DOM run node and template tag. Currently, both are submitted to the parser, which returns nothing. **This contract needs to change.**

When the parser receives a closing tag, it immediately validates and creates the element. Validation is part of its current external contract, but creation is not. This is unfortunate, because it could provide a contextual signal *to the tree reader classes* for the creation of a rich virtual DOM, in place of the current system of placing definition nodes on template elements, which is comparatively less useful. **Decision: remove nodes from the parser, and return the pushed element on simple element and end tag insertion. Return null in the start tag case.**

With all of the preceding changes, `ParagraphReader.classify` may return a virtual node, constructed like so:
```ts
children = []
for (const { tag, content } of entries) {
    children.push(new VirtualNode({
        content,
        tag,
        element: parser.addTag(tag),
        children: []
    }));
}

return new VirtualNode({
    content: view,
    tag: null,
    element: null,
    children
});
```

With a similar change to `TreeReader.classify`, the result is a regular tree of `VirtualNode`s, with signals from the parser materialised in context. Calling `result` post-`classify` guarantees that the template structure is semantically valid, and the `VirtualNode` structure itself is guaranteed to have normalised runs. All that remains for complete tree regularisation is *hoisting*&mdash;or, the guarantee that block element boundary nodes are DOM siblings. This can be deferred until after the listed changes are complete. 

### Hoisting
- `TreeReader` now produces a mutable `VirtualNode` graph, which references start tags and elements. No back-reference from element to node exists.
- However, a "hoisting grammar" needs to be enforced, which relies to some extent on identifying the boundary nodes that were once stored on the element.
- Boundary nodes can be identified in linear time using **breadth-first search,** provided they are **marked as belonging to the same element.** This method has the added benefit of enforcing equal depth of boundary nodes (rendering invariant #1), before validating any other aspect of their intervening paths. *On start, push element N to the level stack. On end, pop **matching element,** or throw. Tracking depth with a sentinel value, if the sentinel is reached and the stack is non-empty, throw.*
- On pop, the search appends to **a list of virtual node pairs.** These pairs represent the endpoints of a path through their lowest common ancestor, which is guaranteed to be equidistant (by invariant #1). However, other aspects of the path may make the element non-renderable. This necessitates **parent referencing** such that each path can be traversed in linear time, using a two-pointer method.
- While parents are not identical, guarantee the following rendering invariants: (2) that DOM tags are equal, and (3) that node text matches the raw text of the template tag. *This should be added to the Tag contract to avoid the need for repeated regex checks (leaky abstraction smell, poor performance).*
- **Hoist:** after loop, replace result nodes with endpoints.

**Changes to existing contracts:**
- *Element matching:* the parser naturally encapsulates the concern of assigning an identifier to tags, as it receives them in order, and matches them to make elements. Modify `addTag` to return a pair of (`id`, `element`), incrementing a class field for each tag, and storing `id` on the `Scope` object. On `#end`, assign `scope.id` to `element.id`.
  - (id: a, element: null): start tag.
  - (id: a, element: (id: a)): simple element.
  - (id: a, element: (id: b)): block element.
- *Tags:* the `Reader` classes orchestrate tag detection, using tag detection functions. These functions are in a position to store the *exact* matched text on `Tag`, simplifying enforcement of invariant #3. *Move `detectIsolatedTag` into `tag.ts`.*
- *Parent referencing:* the `Reader` classes produce `VirtualNode`s, and may set a `parent` reference on all children before returning.

**Further cleanup:**
- The `tag` field on `VirtualNode` is not required, as the hoisting process can rely on `id` and `element` to find paths, and on `element.tag` to validate those paths. Given this cleanup, the final hoist operation consists of copying `id` and `element`.
