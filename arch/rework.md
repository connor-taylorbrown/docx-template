Let's review the design of the parse tree in @arch/parser.md. It is currently needlessly complex to traverse, and could be replaced with a single, non-generic type `Element`. My thinking: an `Element` contains a tag, a list of nodes, and a list of children. While the list of children is 0...n, the list of nodes is 1...2 only.

To break this down somewhat:
- `tag` is a required value. Elements are either simple or block, both of which have a first tag.
- `closeTag` is syntactic noise. It contains nothing of semantic value.
- But the placement of the close tag (i.e. `closeNode`) remains relevant.
- Tracking of intervening elements (e.g. `ContentElement`) is redundant with the underlying DOM.
  - Therefore, at `addCollection`, concatenate `elements` to `current`.
