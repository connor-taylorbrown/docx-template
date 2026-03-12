# Static Analysis

Static analysis proceeds in two passes over parsed expressions, followed by element-level orchestration. All components live in `analyse.ts` (pass 2 + orchestration) and `resolve.ts` (pass 1).

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

## Pass 2: Type hinting (`analyse.ts` — implemented)

Walks the `TypedElement` tree top-down, propagating type hints to leaves and registering variable bindings. The tree is already built, so every operator has access to its full subtree.

### TypeHint and BaseType

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

### ReferenceMap (`analyse.ts` — implemented)

The reference map tracks variable bindings with explicit scoping. It consists of two layers: a shared `context` for global variables, and a per-instance `scope` for scoped variable declarations (e.g. `#each` loop variables).

```ts
class ReferenceMap {
  private context: Map<string, TypeBinding>;
  private scope: Map<string, TypeBinding>;

  get(name): TypeBinding | undefined;   // scope first, then context
  bind(name, hint): void;               // scope if declared, else context
  declare(name): ReferenceMap;           // child with new scoped declaration
}
```

Scoping behaviour:
- `declare("item")` creates a child `ReferenceMap` with a fresh binding for `item`. The child shares the parent's `context` and inherits (by reference) all existing scope entries via shallow copy.
- Non-scoped writes fall through to `context`, visible to all scopes.
- Mutations to binding objects (strengthening, adding properties) propagate through shallow copies, because both parent and child hold references to the same `TypeBinding` objects.
- Shadowing (declaring a name that already exists in scope) replaces the entry with a new object, breaking the link to the parent's binding.

### resolveHint (`analyse.ts` — implemented)

`resolveHint(node, hint, refs)` walks the tree top-down. At each node, `operatorHints` derives child hints from the operator and parent hint. At a leaf, `refs.bind(name, hint)` registers the binding.

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
| `APPLY` | (left: weak string), rule | returnType |

### Binding (`reference-map.ts`)

When `bind` encounters an existing binding:
- **Strong hint + weak binding**: strengthen (replace type).
- **Weak hint + strong binding**: no-op.
- **Strong hint + strong binding**: assert compatibility, then merge.
- **Weak hint + weak binding**: merge.

#### Compatibility (not yet enforced)

Strong/strong conflicts between incompatible kinds should throw:

| | Collection | Structure | Number | Boolean | String |
|---|---|---|---|---|---|
| Collection | yes | | | yes | yes |
| Structure | | yes | | yes | yes |
| Number | | | yes | yes | yes |
| Boolean | | | | yes | yes |
| String | | | | yes | yes |

Boolean and string hints are always weak, so they never reach a strong/strong assertion. A strong/strong conflict means e.g. collection vs number, structure vs collection — a real type error.

#### Merging (not yet implemented)

When the hint and binding are compatible, `bind` should merge rather than replace:

- **Structure + structure**: union the property maps. If both have the same property, merge the property hints recursively.
- **Collection + collection**: merge item types (if both present).
- **Number + number**: `integer` is stricter than unspecified. If one side says integer and the other doesn't, keep integer.
- **Same kind, no substructure** (boolean, string): no-op.

```ts
bind(name, hint):
  existing = lookup(name)
  if !existing → set and return

  // Assert
  if hint.strong && existing.strong:
    assertCompatible(hint.type, existing.type)  // throws on kind mismatch

  // Strengthen
  if hint.strong && !existing.strong:
    existing.strong = true
    existing.type = hint.type
    return

  // Merge (strong+strong after assertion, or weak+weak)
  if existing.strong || hint.strong:
    mergeInto(existing.type, hint.type)          // accumulates properties, items
```

Merging is where `a.b` followed by `a.c` produces `structure { b, c }`. Without it, the second DOT hint replaces the first (on strengthen) or is silently dropped (weak+strong no-op). Neither is correct.

## Element-level orchestration (`analyse.ts` — implemented)

`analyse(element, refs, resolver)` drives both passes per element:

1. Parse the tag content into an `Expression`.
2. Pass 1: `resolver.resolve(expr)` → `TypedElement` with function rules.
3. Pass 2: `resolveHint(typed, contextHint, refs)` → bindings registered.
4. Recurse into `element.children`.

Element-specific behaviour:
- **Simple element**: context hint is weak string.
- **`#if`**: context hint is weak boolean.
- **`#each item in collection`**:
  1. Parse and validate the `IN` structure.
  2. Resolve the collection expression (pass 1 only — no hints yet).
  3. Create a child scope with `refs.declare(declaration)`.
  4. Analyse children in the child scope — usage accumulates type information on the scoped binding (e.g. `item.name` tells us the item has property `name`).
  5. Read back the scoped binding and construct a collection type hint.
  6. Apply the collection hint to the collection expression in the parent context (pass 2).

This ordering is deliberate: the collection's item type is not known until after children are analysed, so the collection expression is hinted last. Expression collections (e.g. `a + b`) require no special handling — ADD propagates the collection hint to both operands.

## Next steps

1. **`assertCompatible`**: strong/strong binding conflicts should throw. Currently `bind` silently ignores incompatible strong hints (e.g. a variable used as both a collection and a number). The compatibility table from renderer.md should be enforced.
2. **`mergeHints`**: when a structure-typed variable is used in multiple DOT expressions (e.g. `a.b` then `a.c`), the property maps should merge rather than one replacing the other. Same for collection item types.
3. **APPLY return type assertions**: `node.returnType` from pass 1 is available but not yet used in `resolveHint`. It should be asserted against the parent hint.
4. **Function registry**: define built-in functions and their signatures.
5. **Literal detection**: leaf nodes that are numeric literals (e.g. `1`, `3.14`) should not be bound as variables. `resolveHint` should detect and skip them, or bind them with a fixed numeric type.
