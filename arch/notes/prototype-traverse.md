---
status: "rejected"
reason: "Template signalling and consistency rules have been enforced using an alternative method, described in tree-regularisation.md."
---
## Building a virtual DOM
The goal of the *prototyping stage* of rendering is to build out a stable virtual DOM, to serve as the basis of all future rendering passes on this template version. The virtual DOM is **comprehensive:** all actual DOM nodes are reachable from its root. It is also **consistent** with two underlying structures:
- *DOM consistency:* Each actual node in the virtual DOM is a descendant of its actual parent.
- *Template consistency:* Each virtual node is the parent of the actual span of a template element.

The "actual span of a template element" is complex to define, so we support this constraint indirectly, by means of *template signalling.*

### Template signalling
The DOM virtualiser delegates the template consistency concern to the *template signaller,* which generalises on the function of the *template parser.* Template parsing is an on-line process, tracking open scopes and validating their proper closure. However, it is completely decontextualised from the DOM. This means that the parser could validate a scope that would fail to render, *because its actual span is undefined.* Rather than modify the parser to support this niche rendering concern, we **extend** the parser by means of a signalling abstraction.

The parser serves as the source of truth for the two scope signals: *open* and *close.* The signaller's role is to reconcile these basic signals with DOM structure, and guide the virtualiser to building the correct actual span. An *actual span* is a list of nodes between the two *boundary nodes* of a block element, such that these nodes are siblings of the boundary nodes, which are siblings of each other. Unfortunately, template tags are defined only in paragraph or run nodes, which may be deeply nested. To avoid confusion, it is important to distinguish *definition nodes* from boundary nodes, which may in fact be ancestors of definition nodes.

The signaller's fundamental role is to identify boundary nodes, in effect by hoisting definition nodes. Before traversing a node, the virtualiser calls `signaller.hoist(node)`, which performs its own traversal. To limit DOM traversal to no more than twice, `hoist` stores its result on the abstract DOM. 