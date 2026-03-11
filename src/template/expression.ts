/* eslint-disable @typescript-eslint/no-duplicate-enum-values -- precedence is intentionally shared */
export const enum Operator {
  PAREN = 0,
  APPLY = 10,
  OR = 20,
  AND = 30,
  EQ = 40,
  NEQ = 40,
  LT = 50,
  LTE = 50,
  GT = 50,
  GTE = 50,
  IN = 50,
  ADD = 60,
  SUB = 60,
  MUL = 70,
  DIV = 70,
  NOT = 80,
  NEG = 80,
  DOT = 90,
}
/* eslint-enable @typescript-eslint/no-duplicate-enum-values */

export interface Expression {
  operator: Operator | null;
  operands: Expression[];
  value: string | null;
}

const BINARY_OPERATORS: ReadonlyMap<string, Operator> = new Map([
  [".", Operator.DOT],
  ["/", Operator.DIV],
  ["*", Operator.MUL],
  ["+", Operator.ADD],
  ["-", Operator.SUB],
  ["<", Operator.LT],
  ["<=", Operator.LTE],
  [">", Operator.GT],
  [">=", Operator.GTE],
  ["=", Operator.EQ],
  ["!=", Operator.NEQ],
  ["and", Operator.AND],
  ["or", Operator.OR],
  ["in", Operator.IN],
]);

const UNARY_OPERATORS: ReadonlyMap<string, Operator> = new Map([
  ["-", Operator.NEG],
  ["not", Operator.NOT],
]);

// Matches: symbol operators, word operators, parentheses, dot-separated
// references, and plain values. Dot is handled by splitting references after
// tokenization to keep the regex simple.
const TOKEN_PATTERN =
  /!=|<=|>=|[+\-*/<>=()]|(?:and|or|not|in)(?=\s|[()]|$)|[^\s+\-*/<>=()!]+/g;

interface OpEntry {
  operator: Operator;
  unary: boolean;
}

function popOperator(output: Expression[], ops: OpEntry[]): void {
  const { operator, unary } = ops.pop()!;
  if (unary) {
    const operand = output.pop()!;
    output.push({ operator, operands: [operand], value: null });
  } else {
    const right = output.pop()!;
    const left = output.pop()!;
    output.push({ operator, operands: [left, right], value: null });
  }
}

function expandDots(token: string): Expression {
  const parts = token.split(".");
  let expr: Expression = { operator: null, operands: [], value: parts[0] };
  for (let i = 1; i < parts.length; i++) {
    const right: Expression = { operator: null, operands: [], value: parts[i] };
    expr = { operator: Operator.DOT, operands: [expr, right], value: null };
  }
  return expr;
}

export function parse(input: string): Expression {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(input)) !== null) {
    tokens.push(match[0]);
  }
  TOKEN_PATTERN.lastIndex = 0;

  const output: Expression[] = [];
  const ops: OpEntry[] = [];
  let expectOperand = true;

  for (const token of tokens) {
    if (token === "(") {
      if (!expectOperand) {
        while (
          ops.length &&
          ops[ops.length - 1].operator !== Operator.PAREN &&
          ops[ops.length - 1].operator >= Operator.APPLY
        ) {
          popOperator(output, ops);
        }
        ops.push({ operator: Operator.APPLY, unary: false });
      }
      ops.push({ operator: Operator.PAREN, unary: false });
      expectOperand = true;
      continue;
    }

    if (token === ")") {
      while (ops.length && ops[ops.length - 1].operator !== Operator.PAREN) {
        popOperator(output, ops);
      }
      ops.pop();
      expectOperand = false;
      continue;
    }

    if (expectOperand) {
      const unOp = UNARY_OPERATORS.get(token);
      if (unOp !== undefined) {
        ops.push({ operator: unOp, unary: true });
        continue;
      }
    }

    if (!expectOperand) {
      const binOp = BINARY_OPERATORS.get(token);
      if (binOp !== undefined) {
        while (
          ops.length &&
          ops[ops.length - 1].operator !== Operator.PAREN &&
          ops[ops.length - 1].operator >= binOp
        ) {
          popOperator(output, ops);
        }
        ops.push({ operator: binOp, unary: false });
        expectOperand = true;
        continue;
      }

      while (
        ops.length &&
        ops[ops.length - 1].operator !== Operator.PAREN &&
        ops[ops.length - 1].operator >= Operator.APPLY
      ) {
        popOperator(output, ops);
      }
      ops.push({ operator: Operator.APPLY, unary: false });
    }

    output.push(expandDots(token));
    expectOperand = false;
  }

  while (ops.length) {
    popOperator(output, ops);
  }

  return output[0];
}
