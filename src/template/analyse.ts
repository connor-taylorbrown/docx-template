import { Operator } from "./operator.js";
import { parse } from "./expression.js";
import type { TypeHint, TypedElement } from "./resolve.js";
import type { Resolver } from "./resolve.js";
import type { Element } from "./parser.js";
import { ReferenceMap } from "./reference-map.js";

export { ReferenceMap } from "./reference-map.js";
export { type TypeBinding } from "./reference-map.js";
export { type BaseType, type TypeHint } from "./resolve.js";

export function resolveHint(
  node: TypedElement,
  hint: TypeHint,
  refs: ReferenceMap,
): void {
  if (node.operator === null) {
    refs.bind(node.value!, hint);
    return;
  }

  const childHints = operatorHints(node, hint);
  for (let i = 0; i < node.operands.length; i++) {
    resolveHint(node.operands[i], childHints[i], refs);
  }
}

const NUM: TypeHint = { strong: true, type: { kind: "number" } };
const INT: TypeHint = { strong: true, type: { kind: "number", integer: true } };
const BOOL: TypeHint = { strong: false, type: { kind: "boolean" } };
const WEAK_STR: TypeHint = { strong: false, type: { kind: "string" } };

function operatorHints(node: TypedElement, hint: TypeHint): TypeHint[] {
  switch (node.operator) {
    case Operator.ADD:
      return [hint, hint];

    case Operator.SUB:
      return [NUM, NUM];

    case Operator.MUL:
      return [INT, hint];

    case Operator.DIV:
      return [NUM, NUM];

    case Operator.NEG:
      return [NUM];

    case Operator.NOT:
      return [BOOL];

    case Operator.AND:
    case Operator.OR:
      return [BOOL, BOOL];

    case Operator.LT:
    case Operator.LTE:
    case Operator.GT:
    case Operator.GTE:
      return [NUM, NUM];

    case Operator.EQ:
    case Operator.NEQ:
      return [
        { strong: false, type: hint.type },
        { strong: false, type: hint.type },
      ];

    case Operator.IN:
      return [
        { strong: false, type: hint.type },
        { strong: true, type: { kind: "collection", item: hint } },
      ];

    case Operator.DOT: {
      const propName = node.operands[1].value!;
      return [
        {
          strong: true,
          type: {
            kind: "structure",
            properties: new Map([[propName, hint]]),
          },
        },
        hint,
      ];
    }

    case Operator.APPLY:
      return [WEAK_STR, node.rule!];

    default:
      throw new Error(`Unsupported operator: ${node.operator}`);
  }
}

export function analyse(
  element: Element,
  refs: ReferenceMap,
  resolver: Resolver,
): void {
  const { tag } = element;

  if (!tag.isKeyword) {
    const expr = parse(tag.head + (tag.params ? " " + tag.params : ""));
    const typed = resolver.resolve(expr);
    resolveHint(typed, WEAK_STR, refs);
    for (const child of element.children) {
      analyse(child, refs, resolver);
    }
    return;
  }

  switch (tag.head) {
    case "#if": {
      const expr = parse(tag.params!);
      const typed = resolver.resolve(expr);
      resolveHint(typed, BOOL, refs);
      for (const child of element.children) {
        analyse(child, refs, resolver);
      }
      return;
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
      throw new Error(`Unsupported keyword: ${tag.head}`);
  }
}
