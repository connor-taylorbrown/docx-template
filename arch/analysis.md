# Static Analysis Sketch

## TypedElement

A unified recursive type for both element-level and expression-level nodes:

```ts
interface TypedElement {
  operator: Operator | null;
  operands: TypedElement[];
  value: string | null;
  element: Element | null;   // non-null at element level, null for expression nodes
  children: TypedElement[];  // non-empty only for block elements
}
```

Node kinds:
- **Leaf**: `operator: null`, `value` is a variable name or literal.
- **Expression node**: `operator` is ADD, DOT, etc. `operands` are sub-expressions. `element: null`, `children: []`.
- **Simple element**: element node *is* the expression root. `element` set, `children` from nested elements.
- **`#if` element**: `operator: IF`, `operands[0]` is the resolved condition expression.
- **`#each` element**: `operator: EACH`, `operands[0]` is the scoped variable declaration (leaf), `operands[1]` is the resolved collection expression. The `IN` node from parsing is consumed and does not appear in output.

## analyse(element: Element): TypedElement

```ts
function analyse(element: Element): TypedElement {
  const { tag } = element;

  if (!tag.isKeyword) {
    const expr = parse(tag.head + (tag.params ? " " + tag.params : ""));
    const hint: TypeHint = { strong: false /* string */ };
    return {
      ...resolve(expr, hint),
      element,
      children: element.children.map((child) => analyse(child)),
    };
  }

  switch (tag.head) {
    case "#if": {
      const expr = parse(tag.params!);
      const hint: TypeHint = { strong: false /* boolean */ };
      return {
        operator: Operator.IF,
        operands: [resolve(expr, hint)],
        value: null,
        element,
        children: element.children.map((child) => analyse(child)),
      };
    }

    case "#each": {
      const expr = parse(tag.params!);

      if (expr.operator !== Operator.IN) {
        throw new Error("#each requires 'in' expression");
      }

      const [declaration, collection] = expr.operands;

      if (declaration.operator !== null) {
        throw new Error("#each declaration must be a plain name");
      }

      const hint: TypeHint = { strong: true /* collection */ };
      return {
        operator: Operator.EACH,
        operands: [
          // operands[0]: scoped variable declaration (leaf)
          { operator: null, operands: [], value: declaration.value,
            element: null, children: [] },
          // operands[1]: collection expression, typed
          resolve(collection, hint),
        ],
        value: null,
        element,
        // Children analysed with scope — declaration.value is in scope
        children: element.children.map((child) => analyse(child)),
      };
    }

    default:
      throw new Error(`Unsupported keyword: ${tag.head}`);
  }
}
```

## resolve(expr: Expression, hint: TypeHint): TypedElement

Recursively converts Expression → TypedElement, applying type hints.

```ts
function resolve(expr: Expression, hint: TypeHint): TypedElement {
  if (expr.operator === null) {
    // Leaf: register variable with hint
    return {
      operator: null,
      operands: [],
      value: expr.value,
      element: null,
      children: [],
    };
  }

  const operator = mapOperator(expr);
  const childHints = resolveHints(operator, hint);

  return {
    operator,
    operands: expr.operands.map((operand, i) =>
      resolve(operand, childHints[i]),
    ),
    value: null,
    element: null,
    children: [],
  };
}
```

### Supporting functions (TBD)

- `mapOperator(expr: Expression): Operator` — maps expression operator string to Operator enum, using operand count to distinguish SUB/NEG.
- `resolveHints(operator: Operator, parentHint: TypeHint): TypeHint[]` — derives per-operand type hints from operator rules and parent context.
- `TypeHint` — strong/weak flag plus base type (TBD).
