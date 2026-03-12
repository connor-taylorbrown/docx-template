# Static Analysis

Static analysis proceeds in two passes over parsed expressions, followed by element-level orchestration.

## Pass 1: Rule resolution (`resolve.ts` — implemented)

Converts `Expression` → `TypedElement`, building the tree structure and resolving function signatures. No type hints flow in this pass.

### TypedElement

```ts
interface TypedElement {
  operator: Operator | null;
  operands: TypedElement[];
  value: string | null;
  rule: TypeHint | null;       // APPLY nodes only: param hint for right operand
  returnType: TypeHint | null; // outermost APPLY only: function return type
}
```

At the element level (pass 2), two additional fields are needed:
```ts
  element: Element | null;     // non-null at element level
  children: TypedElement[];    // non-empty only for block elements
```

Node kinds:
- **Leaf**: `operator: null`, `value` is a variable name or literal.
- **Expression node**: `operator` is ADD, DOT, etc. `operands` are sub-expressions.
- **APPLY node**: `rule` is the parameter hint for its right operand. Only the outermost APPLY in a function call chain has `returnType` set.

### Resolver

`Resolver` is a class parameterised by a `FunctionRegistry`:

```ts
interface FunctionRegistry {
  lookup(name: string): TypeHint[] | null; // returns [PN, ..., P1, Return] or null
}
```

`resolve(expr)` handles three cases:
- **Leaf**: wrap as-is.
- **APPLY**: delegate to `resolveApply`, which walks the left spine of the APPLY chain.
- **Other operators**: recurse into operands. DOT validates that its right operand is a leaf.

`resolveApply(expr)` manages the function signature stack:
- **Base case** (left is a leaf): look up the function name, pop return type, pop parameter hint.
- **Recursive case** (left is another APPLY): recurse to get the remainder stack.
- Each APPLY node stores the popped parameter hint as `rule`. The return type threads unchanged through all recursive calls and is set on the outermost node by `resolve`.

Error conditions:
- Unknown function name (lookup returns null).
- Left operand is neither a leaf nor another APPLY.
- Stack exhausted at an APPLY node (too many arguments).
- Remaining stack after the outermost APPLY is silently discarded (supports default/optional parameters).

## Pass 2: Type hinting (`analyse.ts` — not yet implemented)

Walks the `TypedElement` tree top-down, propagating type hints to leaves and registering variable bindings. The tree is already built, so every operator has access to its full subtree.

### TypeHint

```ts
interface TypeHint {
  strong: boolean;
  type: BaseType;
}

type BaseType =
  | { kind: "string" }
  | { kind: "boolean" }
  | { kind: "number"; integer?: boolean }
  | { kind: "collection"; item?: TypeHint }
  | { kind: "structure"; properties: Map<string, TypeHint> };
```

Boolean and string hints are always weak. Collection, structure, and number hints are strong.

### resolveHint

`resolveHint(node, hint, refs)` walks the tree top-down. At each node, it derives child hints from the operator and parent hint, then recurses. The tree is already built (pass 1), so operators that need subtree information can read it directly:

- **DOT**: reads `operands[1].value` to construct a structure property hint for the left operand.
- **APPLY**: reads `node.rule` as the hint for the right operand. Uses `node.returnType` (if set) as an assertion against the parent hint.
- **Other operators**: derive hints from operator semantics (see table below).

At a leaf, `bindVariable` registers or asserts against the reference map.

### Operator hint rules

| Operator | Operand hints | Returns |
|----------|--------------|---------|
| `EQ`, `NEQ` | weak(parent), weak(parent) | weak boolean |
| `NOT` | weak boolean | weak boolean |
| `NEG` | strong number | strong number |
| `AND`, `OR` | weak boolean, weak boolean | weak boolean |
| `ADD` | parent, parent | parent |
| `SUB` | strong number, strong number | strong number |
| `MUL` | strong integer, parent | parent |
| `DIV` | strong number, strong number | strong decimal |
| `LT`, `LTE`, `GT`, `GTE` | strong number, strong number | weak boolean |
| `IN` | weak(parent), strong collection(parent) | weak boolean |
| `DOT` | strong structure({RHS.value: parent}), parent | parent |
| `APPLY` | (left: recurse), rule | returnType |

### Reference map and binding

```ts
type ReferenceMap = Map<string, TypeBinding>;

interface TypeBinding {
  strong: boolean;
  type: BaseType;
}
```

When a leaf is visited with a hint:

| Hint | Binding | Action |
|------|---------|--------|
| Strong | Strong | Assert compatibility, error if inconsistent |
| Strong | Weak | Strengthen binding |
| Weak | Strong | No-op |
| Weak | Weak | Add hints |

Type compatibility (rows can be used as columns):

| | Collection | Structure | Number | Boolean | String |
|---|---|---|---|---|---|
| Collection | yes | | | yes | yes |
| Structure | | yes | | yes | yes |
| Number | | | yes | yes | yes |
| Boolean | | | | yes | yes |
| String | | | | yes | yes |

## Element-level orchestration (`analyse.ts` — not yet implemented)

`analyse(element, refs)` wraps both passes:

1. Parse the tag content into an `Expression`.
2. Pass 1: `resolver.resolve(expr)` → `TypedElement` with function rules.
3. Pass 2: `resolveHint(typedElement, contextHint, refs)` → bindings registered.
4. Recurse into `element.children`.

Element-specific behaviour:
- **Simple element**: context hint is weak string.
- **`#if`**: context hint is weak boolean.
- **`#each item in collection`**: context hint is strong collection. Validates the `IN` node structure. Creates a scoped reference map for children, binding the declaration variable to the collection's item type.

## Next steps

1. **`BaseType` on `TypeHint`**: currently `TypeHint` has only `strong: boolean`. Adding the `type` discriminated union is prerequisite for pass 2.
2. **`resolveHint`**: implement the top-down hint propagation walk, using the operator hint table.
3. **`bindVariable` and `assertCompatible`**: implement the reference map with the 4-case binding table and compatibility checks.
4. **`analyse`**: element-level orchestration, including `#each` scoping.
5. **Function registry**: define built-in functions and their signatures.
6. **Hint merging**: when weak hint meets weak binding, merge structure property maps and collection item types rather than replacing.
