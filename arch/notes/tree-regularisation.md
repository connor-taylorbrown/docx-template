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
