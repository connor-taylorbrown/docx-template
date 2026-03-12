import { Literal, Operator } from "./operator.js";
import type { Expression } from "./expression.js";

export type BaseType =
  | { kind: "string" }
  | { kind: "boolean" }
  | { kind: "number"; integer?: boolean }
  | { kind: "collection"; item?: TypeHint }
  | { kind: "structure"; properties: Map<string, TypeHint> };

export interface TypeHint {
  strong: boolean;
  type: BaseType;
}

const LITERAL_TYPES: Record<Literal, TypeHint> = {
  [Literal.INTEGER]: { strong: true, type: { kind: "number", integer: true } },
  [Literal.DECIMAL]: { strong: true, type: { kind: "number" } },
};

export interface TypedElement {
  operator: Operator | null;
  operands: TypedElement[];
  value: string | null;
  rule: TypeHint | null;
  returnType: TypeHint | null;
}

export interface FunctionRegistry {
  lookup(name: string): TypeHint[] | null;
}

export class Resolver {
  constructor(private readonly functions: FunctionRegistry) {}

  resolve(expr: Expression): TypedElement {
    if (expr.operator === null) {
      return {
        operator: null, operands: [], value: expr.value,
        rule: null,
        returnType: expr.literal !== null ? LITERAL_TYPES[expr.literal] : null,
      };
    }

    if (expr.operator === Operator.APPLY) {
      const { node, returnType } = this.resolveApply(expr);
      node.returnType = returnType;
      return node;
    }

    if (expr.operator === Operator.DOT) {
      if (expr.operands[1].operator !== null) {
        throw new Error("DOT right operand must be a plain name");
      }
    }

    const operands = expr.operands.map((op) => this.resolve(op));
    return {
      operator: expr.operator, operands, value: null,
      rule: null, returnType: null,
    };
  }

  private resolveApply(expr: Expression): { node: TypedElement; stack: TypeHint[]; returnType: TypeHint } {
    const [leftExpr, rightExpr] = expr.operands;

    let left: TypedElement;
    let stack: TypeHint[];
    let returnType: TypeHint;

    if (leftExpr.operator === Operator.APPLY) {
      ({ node: left, stack, returnType } = this.resolveApply(leftExpr));
    } else if (leftExpr.operator === null) {
      const sig = this.functions.lookup(leftExpr.value!);
      if (sig === null) {
        throw new Error(`Unknown function '${leftExpr.value}'`);
      }
      stack = sig;
      returnType = stack.pop()!;
      left = {
        operator: null, operands: [], value: leftExpr.value,
        rule: null, returnType: null,
      };
    } else {
      throw new Error("Left operand of function call must be a name");
    }

    if (stack.length === 0) {
      throw new Error(
        `Too many arguments for function '${this.findFunctionName(left)}'`,
      );
    }
    const paramHint = stack.pop()!;

    const right = this.resolve(rightExpr);

    return {
      node: {
        operator: Operator.APPLY,
        operands: [left, right],
        value: null,
        rule: paramHint,
        returnType: null,
      },
      stack,
      returnType,
    };
  }

  private findFunctionName(node: TypedElement): string {
    if (node.operator === null) return node.value!;
    return this.findFunctionName(node.operands[0]);
  }
}
