import { Operator } from "../template/operator.js";
import type { TypeHint, TypedElement } from "./resolve.js";
import type { Resolver } from "./resolve.js";
import type { Element } from "../template/parser.js";
import { ReferenceMap, assertCompatible } from "./reference-map.js";

export { ReferenceMap } from "./reference-map.js";
export { type TypeBinding } from "./reference-map.js";
export { type BaseType, type TypeHint } from "./resolve.js";

export function resolveHint(
  node: TypedElement,
  hint: TypeHint,
  refs: ReferenceMap,
): TypeHint {
  if (node.operator === null) {
    if (node.returnType !== null) return node.returnType;
    refs.bind(node.value!, hint);
    const binding = refs.get(node.value!);
    return binding ? { strong: binding.strong, type: binding.type } : hint;
  }

  if (node.returnType !== null) {
    if (hint.strong && node.returnType.strong) {
      assertCompatible(hint.type, node.returnType.type);
    }
  }

  if (node.operator === Operator.MUL) {
    const [left, right] = node.operands;
    const rightResolved = resolveHint(right, hint, refs);
    resolveHint(left, rightResolved.type.kind === "number" ? NUM : INT, refs);
    return hint;
  }

  if (node.operator === Operator.DOT) {
    const [left, right] = node.operands;
    const propName = right.value!;
    resolveHint(left, {
      strong: true,
      type: { kind: "structure", properties: new Map([[propName, hint]]) },
    }, refs);
    return hint;
  }

  if (node.operator === Operator.APPLY) {
    const [left, right] = node.operands;
    if (left.operator !== null) {
      resolveHint(left, hint, refs);
    }
    resolveHint(right, node.rule!, refs);
    return node.returnType ?? hint;
  }

  const [childHints, returnHint] = operatorHints(node, hint);
  for (let i = 0; i < node.operands.length; i++) {
    resolveHint(node.operands[i], childHints[i], refs);
  }
  return returnHint;
}

const NUM: TypeHint = { strong: true, type: { kind: "number" } };
const INT: TypeHint = { strong: true, type: { kind: "number", integer: true } };
const BOOL: TypeHint = { strong: false, type: { kind: "boolean" } };
const WEAK_STR: TypeHint = { strong: false, type: { kind: "string" } };


function operatorHints(node: TypedElement, hint: TypeHint): [TypeHint[], TypeHint] {
  switch (node.operator) {
    case Operator.ADD:
      return [[hint, hint], hint];

    case Operator.SUB:
      return [[NUM, NUM], NUM];

    case Operator.DIV:
      return [[NUM, NUM], NUM];

    case Operator.NEG:
      return [[NUM], NUM];

    case Operator.NOT:
      return [[BOOL], BOOL];

    case Operator.AND:
    case Operator.OR:
      return [[BOOL, BOOL], BOOL];

    case Operator.LT:
    case Operator.LTE:
    case Operator.GT:
    case Operator.GTE:
      return [[NUM, NUM], BOOL];

    case Operator.EQ:
    case Operator.NEQ:
      return [
        [
          { strong: false, type: hint.type },
          { strong: false, type: hint.type },
        ],
        BOOL,
      ];

    case Operator.IN:
      return [
        [
          { strong: false, type: hint.type },
          { strong: true, type: { kind: "collection", item: hint } },
        ],
        BOOL,
      ];

    default:
      throw new Error(`Unsupported operator: ${node.operator}`);
  }
}

export function analyse(
  element: Element,
  refs: ReferenceMap,
  resolver: Resolver,
): void {
  const { keyword, expression } = element;

  if (keyword === null) {
    const typed = resolver.resolve(expression);
    resolveHint(typed, WEAK_STR, refs);
    for (const child of element.children) {
      analyse(child, refs, resolver);
    }
    return;
  }

  switch (keyword) {
    case "#if": {
      const typed = resolver.resolve(expression);
      resolveHint(typed, BOOL, refs);
      for (const child of element.children) {
        analyse(child, refs, resolver);
      }
      return;
    }

    case "#each": {
      if (expression.operator !== Operator.IN) {
        throw new Error("#each requires 'in' expression");
      }

      const [declaration, collection] = expression.operands;

      if (declaration.operator !== null) {
        throw new Error("#each declaration must be a plain name");
      }

      const typedCollection = resolver.resolve(collection);

      const childRefs = refs.declare(declaration.value!);
      for (const child of element.children) {
        analyse(child, childRefs, resolver);
      }

      const itemBinding = childRefs.get(declaration.value!);
      const collectionHint: TypeHint = {
        strong: true,
        type: {
          kind: "collection",
          item: itemBinding
            ? { strong: itemBinding.strong, type: itemBinding.type }
            : undefined,
        },
      };
      resolveHint(typedCollection, collectionHint, refs);
      return;
    }

    default:
      throw new Error(`Unsupported keyword: ${keyword}`);
  }
}
