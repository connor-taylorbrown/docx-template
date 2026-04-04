---
status: "cancelled"
reason: "This is a brainstorming document. Some of its ideas influence the final implementation, but this does not serve as a functional guide."
---
## Working through rendering
- Each *variable* updates a series of *scopes.*
- A scope is a structural element, identified by reference (read-only `RenderElement`).
  - A scope controls part of a container. The last node of the scope span is always the last node of the container.
  - Containers are instantiated in the DOM. In the case of `#each` elements, they may be instantiated multiple times.
- A scope can update simple elements in place, but container updates may change the DOM structure.
- *What is "in place"?* Content elements contain relative offset and group identifiers.
  - The highest numbered group is shared with the container.
- Simplest case: a variable maps to a simple element, which maps to a DOM node.
- Collection case: an item maps to a container instance, which controls a series of elements.
  - Collection containers are instantiated *for each item,* meaning that the prototype span may either be copied or deleted.
- Difference between container and scope: one element in a scope corresponds to one element in a template, while one element in a template corresponds to many elements in a container of multiple instances.
  - Cloning of DOM nodes must be driven by cloning of template elements. These clones may then search the DOM for managed nodes, identified by element number.
  - Block boundary nodes must be stripped from render output. Therefore, they are available for element-to-DOM mapping, but not for container deletion (e.g. after collection update, or branch change).
- A collection container may concatenate instance nodes to the empty list. But the set of nodes to replace can vary with the number of nested container instances (e.g. if the complete element tree is inline).
  - Container elements have a *fixed span:* the number of DOM siblings between their boundary nodes, exclusive of nodes belonging to nested containers.
  - Nested containers also have a parent and a relative offset. When unmounting from bottom up, the relative offset and the fixed span determine which nodes should be spliced, and where new nodes should be placed.

### Operations on a virtual DOM
Because start/end nodes must be stripped from the render product, it is necessary to track spans in some other way. We assign each scope a *virtual parent,* which points to an underlying parent, contained in the rendered DOM.
- Simple elements are not virtualised, as they appear in the actual DOM, so their tracking information is retained there.
- The span of a scope, as a `DocumentNode` array, may contain a mix of actual and virtual nodes. All nodes in a span share an underlying parent.
- Implication: if a child container wraps some span of a DOM sibling or sibling's descendant, then it is reachable by actual node traversal only. *It has no effect on affected span calculation.*

*What is a virtual node?*
- Actual nodes wrap DOM nodes.
- DOM nodes have parents. The parent of an actual node is the node that wraps that parent.
- DOM nodes have zero or more children. The children of an actual node are the nodes that wrap those children.
- Virtual nodes do not wrap DOM nodes. The parent of a virtual node is the parent of its actual children.
- Actual nodes reference actual nodes, while virtual nodes reference both kinds.
- Element instances hold virtual node references. A bottom-up cleanup process frees these up for garbage collection.

**Unmount:**
- Clear instance tree
- Return affected span (parent, first node, length)
  - Implement method on `DocumentNode`: return leftmost leaf node, and sum of all spans, for given underlying parent.

**Prototype:**
- Promote boundary nodes: Ensure that boundary nodes share a parent, replacing with parent until they do.
- Identify actual span: Given parent, get offset and width from boundary node references.
- Wrap span: Reading child elements and span as queues into prototype and node lists&mdash;
  - While next child is not on-span container, append prototype.
    - Implicit promotion: on-span means shares parent, so boundary nodes are promoted in this check.
    - When prototype for container receives empty queue, it performs span identification.
    - Prototype for simple element is base case.
  - While next node is not owned by head of queue (on-span container), append node.
  - Prototype head of queue, consuming subspan and returning (prototype, virtual node). Append both.
- Return virtual node with node list, and prototype with prototype list.

`prototype` returns a `RenderElement` tree, consisting of the following types:
- `IfContainer`: encapsulates branch execution and selection.
- `EachContainer`: encapsulates collection iteration and item instance management.
- `DOMReference`: encapsulates actual node updates.

Every `RenderElement` owns a single node: virtual in the case of containers, actual in the case of `DOMReference`. DOM management functionality is delegated to the node tree.
- `EachContainer` adds a layer to the virtual DOM: container node has item children, enabling per-item update and deletion.