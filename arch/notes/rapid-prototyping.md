---
status: "cancelled"
reason: "This is a brainstorming document. While many of its ideas are significant to the final implementation of the rendering pipeline, its approach to parser signalling and hoisting (described here as 'promotion') is awkward and overly coupled with the prototyping stage. The approach described in tree-regularisation.md is decidedly clearer, and has been adopted instead."
---
## Rapid prototyping&mdash;high signal development
- A rendering pipeline consists of three major components:
  - Template parser: reads the template, identifies the variables and the evaluation structure.
  - Template evaluator: reads the variables, determines the values to render.
  - Document renderer: applies the values to their proper positions in the document.
- We can verify that the parser works relatively easily&mdash;does it map from a source to an AST?
  - If we're doing static analysis, then we can validate the artifacts that it produces, and iterate over these reliably.
- But how do we test an evaluator without a renderer, or vice versa? Is the complexity irreducible? *Obviously not.*
  - Follow the pattern&mdash;map from template to AST, map from AST to evaluation result, map from evaluation result to DOM.
  - **What does an evaluation result look like?** This is the contract that drives delivery of document rendering.
- An evaluation result is like a DOM diff. Its purpose is to modify the DOM in a targeted manner, identifying a fixed parent, and two child spans: the span to collect, and the span to allocate.
  - Rendering amounts to a series of swap operations over DOM node child lists.
  - Orchestrating the swap is the document renderer's clearest function.
  - However, the knowledge of which span to collect, and what content to replace it with, seems naturally encapsulated by the evaluator. Even *when to collect* is a delegated concern&mdash;while a variable may cause a condition block to reevaluate, if the final result does not change, neither should the DOM.
  - **The renderer is the orchestrator:** it invokes the evaluator, decides *whether* to collect, then manages the swap. It imposes a *collection contract* and an *allocation contract.*
  - The evaluator encapsulates expression evaluation, span collection, and span allocation. **It does not drive any of these operations, and as such, does not invoke any nested element evaluators.**
- Having decided to separate **invocation** from **allocation**, there are two prominent challenges to work through:
  - A loop must allocate *for each item in its collection,* notwithstanding any control statements (i.e. `continue` or `break`).
  - A nested element must be invoked *on the allocated DOM,* not the preexisting DOM.
  - **Solution 1:** The renderer calls `allocate` in a loop. Simple elements then behave as lists of one item; conditional blocks as lists of 0 or 1 items; loop blocks as lists of 0 to *n* items.
  - **Solution 2:** The renderer *invokes nested elements for each allocation.* The new DOM segment is materialised, and the element holds a reference into it. Allocation may take place *after nested invocation* to ensure atomicity.
  - **Amendment to the above:** The evaluator must encapsulate *materialisation,* while the renderer owns allocation.

### Atomic rendering
- *Evaluate* the expression,
- While there is an item:
  - If previous state is identical, continue. Otherwise,
  - *Collect* the outdated span,
  - *Materialise* the item,
  - *Render* each child element (recursive step),
  - *Allocate* the materialised span.

**Questions:**
- *How does the renderer identify which expression to evaluate?* All changes to state are caused by changes to variables, and every variable is statically referenced in the template structure. **Back-references to target elements must be available for each variable.**
- *How does the renderer track state changes?* As the renderer deals in static references to the element tree, the element serves as the repository of instance state.
  - Instance state is an array of *items.*
  - Evaluation results are compared itemwise, e.g. consuming previous state as a queue. For each difference, materialise DOM; otherwise retain.
  - Elements nested inside loops may have multiple instantiations. *Element state* therefore consists minimally of an array of instance states.
  - There is no guarantee, however, that there will be as many instances of a nested element as there are repetitions of a loop. This is due to conditional blocks: on a false branch, nothing is instantiated. **The renderer must index instances in a stable but sparse manner, necessitating the use of a map for element state.**

### Virtual nodes&mdash;the link from instance to DOM
Where a *reference map* links variables to elements, the map from element to DOM is per instance, or *many to one.* To simplify reference management, one node per span is preferable. This is directly achievable for simple elements, while for block elements, there may be any number of intervening nodes between the *start* and *end,* which are identified in the template structure. These *boundary nodes* must be siblings in the DOM. If there are any nested elements, these are not necessarily on-span: their nodes (single or boundary nodes) may be span descendants. **In any case, the span of an element is not coextensive with the DOM parent's children.**

To resolve this problem, we employ *virtual nodes.* Each virtual node corresponds to one element instance, and has as its children the *internal span* of the element. The operations of *materialisation* and *collection* are naturally encapsulated on this virtual node: in the former case, cloning is isolated to the internal span; in the latter, collection may *mark* the internal span, to then *sweep* as part of the swap operation. **The full collection operation is encapsulated by the renderer, but the evaluator's collection contract extends to identifying which nodes to collect.**

Designing for nested rendering has ramifications for allocation. When iterating over a collection, the renderer materialises each item, then renders each nested element. Doing this recursively requires a virtual node that references a span *of the materialised DOM.* This virtual node is retained as the current, unique reference for all DOM operations involving this instance. It is natural that this node should itself be a product of the materialisation operation, as this encapsulates the *unique DOM reference* concern. But now we want a mapping between a transient *node* and a stable *element.* We must depend in the direction of stability, and copy this reference as part of materialisation. **The variable references the element, and the node references the element.**

As the renderer must find its node-element mapping from the virtual node, its natural data structure is not the element tree, but the *virtual DOM.* Whereas the virtual node-element mapping is implicitly many-to-one, the virtual node belongs entirely to one instance. If the virtual node encapsulates instance state, **this breaks up the element-instance map, and eliminates the requirement for instance numbering.** The element continues to serve as both an expression evaluator, and a materialisation source. As an evaluator, it may be *stateless:* given a scoped reference map, return an iterable result. As both an evaluator and recurrent source of structure, we might consider renaming element/evaluators in the rendering domain to *prototypes.* Rendering is then the process of *cloning a prototype,* and *allocating the clone.*

When execution is orchestrated over the virtual DOM, scope management becomes one of its concerns. A collection element declares an *item variable,* and defines a *collection expression.* When the renderer calls `evaluate` on the prototype, getting *the next item* implies some kind of state tracking, e.g. in `render` as it iterates.
- Collection expressions might evaluate to arrays or iterator functions. While this difference should be transparent to the render loop, caching this array for the duration of the render is a vital optimisation. We may sacrifice some statelessness for a `currentIterator` field, on the assumption that template evaluation is single-threaded. The `evaluate` method then receives an index. If `currentIterator` is an array, use the index, otherwise call the `next` method. This latter method is a runtime contract, out of scope for rendering.
- The `evaluate` method may encapsulate assignment of these item values to their scoped name, but not the creation of scopes themselves. The `render` method may create a scope whenever the current node references an element, and dispose of it implicitly on return.

### From document to virtual DOM: weak dependency on static analysis
The output of the template parser&mdash;an element tree&mdash;is ideal for static analysis passes, but is decontextualised and awkward for anything involving rendering. Static analysis is useful for building the virtual DOM, however, as it creates a typed reference map. This map is necessary for populating back-references: while traversing the original DOM and parsing expressions, we identify which variables control which prototypes.

The template parser employed for static analysis has two useful features. Firstly, it *guarantees a one-to-one mapping between tag and node*&mdash;either by modifying the original DOM (i.e. run normalisation) or validating that a tag is the text of a paragraph node (ignoring whitespace). Secondly, it uses an *on-line algorithm.* This means that with each tag insertion, its effect on the element tree is known as a result. For example, the effect of an `#end` tag is to build an element, whose tag and parameters are known to the parser. At this point, we have all the information needed to build a prototype, if we have been tracking its internal span correctly.

#### Tracking internal span: some considerations
The parser implemented in `parser.ts` does not encapsulate tag detection. For this reason, we may avoid inserting simple elements: a `!isKeyword` check is enough to prototype these correctly. It also does not return any elements apart from the entire validated AST on `parse`. This should change, such that `addTag` **returns the newly created element after updating the AST.** The null return value then, by contract, means that a start tag was inserted. *For consistency, we should return simple elements after insertion, even if we do not rely on this behaviour.*

We have said that an element's boundary nodes must be siblings in the DOM. However, tags may occupy run or paragraph nodes only. This complicates the handling of any elements whose tags appear in nested structures like tables. When a start tag is inserted (null return value), we should create a virtual node, but speculatively, in case the end tag is on-span. If it is, we create the prototype, add the virtual node to our virtual DOM span, and continue. If it is not, we invalidate the virtual node. Then we return a *promotion node,* signalling to the caller that an element is open, and one of their descendants may close it.

Promotion is further complicated by the need to ensure that rendering will maintain a consistent DOM. Rather than giving the end user a template that fails or works in an unexpected manner, prototype resolution should enforce a particular standard for the template author to meet. The promotion node should then serve as *a stack trace of virtual node invalidation events,* recording the DOM tag of each case. Invalidation should throw if either the virtual node has children, or the head of the span has children. **This enforces the invariant of one tag per node under promotion.** To close a promoted virtual node, it is parsimonious to use the same algorithm. Both invalidation stacks may then be compared destructively, throwing on a mismatch. **This enforces the invariant that elements are bounded by parallel, sibling structures.** These two invariants result in templates that do not unreasonably restrict the author. Where the author is constrained, these restrictions are easy to work with, particularly under the guidance of clear error messages.

#### Composing and referencing prototypes
Where the promotion protocol is used to both open and terminate virtual node spans, the distinction must be flagged. The start tag serves as a useful flag. After virtual node closure, we may construct a prototype from the flag, then link the virtual node to the prototype.

At this stage, we have a virtual DOM linking to prototypes, without backlinks. This is sufficient for a first-pass render from root. During a render pass, `evaluate` references variables&mdash;the particular reference map interface should require caller references (i.e. `this`). These back-references are stable. However, they provide no way on their own to cycle the renderer over a particular virtual node. This is where the *instance map* concept makes its return: when the renderer requests `materialise` or `collect` with a *cache key,* the prototype manages its back-reference cache accordingly.
- Cache keys facilitate a stable mapping between collection items and virtual nodes for the duration of that item's existence. They arise from the reference map by way of `evaluate`, and `materialise` stores them for later use with `collect`.
- Every element declared inside a loop block, whether it is an item reference or not, retains an instance map of cache key to virtual node. If a variable update does not specify a cache key, a render operation is queued *for all instances.*
