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
- **Leaf**: `operator: null`, `value` is a variable name or literal. `returnType` is set for numeric literals (mapped from `Expression.literal` via `LITERAL_TYPES` in resolve.ts); null for variables.
- **Expression node**: `operator` is ADD, DOT, etc. `operands` are sub-expressions.
- **APPLY node**: `rule` is the parameter hint for its right operand. Only the outermost APPLY in a function call chain has `returnType` set (to the function's return type from the registry).

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

### ReferenceMap (`reference-map.ts` — implemented)

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

`resolveHint(node, hint, refs): TypeHint` walks the tree top-down, returning the resolved type of the node. It handles three categories of node:

**Leaves:** If the node has a `returnType` (literal), return it without binding. Otherwise, `refs.bind(name, hint)` and return the binding's actual type.

**Special-cased operators** (handled directly in `resolveHint`, not via `operatorHints`):
- **MUL**: resolve right first; if its return type is numeric, hint left as strong number, otherwise strong integer. Returns parent hint.
- **DOT**: resolve left only, with a structure hint containing the property name. The right operand (property name) is never recursed into — it is a label, not an expression. Returns parent hint.
- **APPLY**: resolve right with `node.rule` (parameter hint). For the left operand: recurse only if it is an operator node (inner APPLY in a multi-arg call); skip if it is a leaf (function name — not a variable). Returns `node.returnType ?? hint`.

**Uniform operators** (handled by `operatorHints`, which returns `[childHints[], returnHint]`):

| Operator | Operand hints | Returns |
|----------|--------------|---------|
| `EQ`, `NEQ` | weak(parent), weak(parent) | weak boolean |
| `NOT` | weak boolean | weak boolean |
| `NEG` | strong number | strong number |
| `AND`, `OR` | weak boolean, weak boolean | weak boolean |
| `ADD` | parent, parent | parent |
| `SUB` | strong number, strong number | strong number |
| `DIV` | strong number, strong number | strong number |
| `LT`, `LTE`, `GT`, `GTE` | strong number, strong number | weak boolean |
| `IN` | weak(parent), strong collection(parent) | weak boolean |

**Return type assertion:** Before any operator handling, if `node.returnType` is set and both it and `hint` are strong, `assertCompatible` is called. This catches type errors like using a number-returning function in a collection context. Only the outermost APPLY has `returnType` set (from pass 1); inner APPLYs and other operators have `null`.

### Binding (`reference-map.ts`)

When `bind` encounters an existing binding:
- **Strong hint + weak binding**: strengthen (replace type).
- **Weak hint + strong binding**: no-op.
- **Strong hint + strong binding**: assert compatibility, then merge.
- **Weak hint + weak binding**: merge.

#### Compatibility (`assertCompatible` — implemented)

Strong/strong conflicts between incompatible kinds throw. Same-kind is always compatible.

| | Collection | Structure | Number | Boolean | String |
|---|---|---|---|---|---|
| Collection | yes | | | yes | yes |
| Structure | | yes | | yes | yes |
| Number | | | yes | yes | yes |
| Boolean | | | | yes | yes |
| String | | | | yes | yes |

Boolean and string hints are always weak, so they never reach a strong/strong assertion. A strong/strong conflict means e.g. collection vs number, structure vs collection — a real type error.

#### Merging (`mergeInto` — implemented)

When the hint and binding are compatible, `bind` merges rather than replaces:

- **Structure + structure**: union the property maps. Overlapping properties merge recursively.
- **Collection + collection**: merge item types (if both present, recurse; if only one has an item, adopt it).
- **Number + number**: `integer` is sticky — if either side says integer, result is integer.
- **Same kind, no substructure** (boolean, string): no-op.

```ts
bind(name, hint):
  existing = lookup(name)
  if !existing → set and return

  // Assert
  if hint.strong && existing.strong:
    assertCompatible(hint.type, existing.type)  // throws on kind mismatch
    mergeInto(existing.type, hint.type)
    return

  // Strengthen
  if hint.strong && !existing.strong:
    existing.strong = true
    existing.type = hint.type
    return

  // Weak + weak: merge
  if !hint.strong && !existing.strong:
    mergeInto(existing.type, hint.type)
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

### Literal detection (`expression.ts`, `resolve.ts` — implemented)

Numeric literals are detected at parse time. The `Expression` interface carries a `literal: Literal | null` field, where `Literal` is an enum (`INTEGER`, `DECIMAL`) defined in `operator.ts`. The `classifyLiteral` function in `expression.ts` tests tokens against `NUMERIC_LITERAL` and returns the appropriate variant. Decimal literals like `3.14` are tokenized as a single token (the decimal pattern precedes `.` in `TOKEN_PATTERN`), preventing them from being split into `DOT(3, 14)`.

`resolve.ts` maps `Literal` → `TypeHint` via `LITERAL_TYPES` and sets `returnType` on the leaf `TypedElement`. In `resolveHint`, a leaf with `returnType !== null` is a literal — it returns its intrinsic type without calling `refs.bind()`.

The regex rejects leading zeros (except bare `0`), scientific notation (`1e5`), and non-numeric tokens. Negative literals are handled by the `NEG` operator — `-1` parses as `NEG(1)`.

### Risks mitigated

- **DOT property names were bound as variables.** `a.b` previously recursed into the right operand, calling `refs.bind("b", hint)`. This polluted the reference map with property names. Now DOT only recurses into its left operand; the right is read as a label.
- **Function names were bound as variables.** `fn x` previously recursed into the left operand, calling `refs.bind("fn", weakString)`. Now APPLY skips leaf left operands (function names) and only recurses into operator left operands (inner APPLY nodes in multi-arg calls).
- **Decimal literals were parsed as DOT expressions.** `3.14` tokenized as `3 . 14`, producing `DOT(leaf("3"), leaf("14"))`. Now `TOKEN_PATTERN` matches decimal literals before `.`, producing a single leaf with `literal: Literal.DECIMAL`.
- **MUL over-constrained the left operand.** `a * b` always hinted `a` as integer, even when `b` was numeric (where any number is valid). Now the right operand is resolved first and its type inspected.
- **APPLY return types were not asserted.** A number-returning function used in a collection context (e.g. `#each item in fn x`) silently passed. Now `assertCompatible` is called when both the return type and parent hint are strong.

## Next steps

1. **Function registry**: define built-in functions and their signatures.
