import { Operator } from "./operator.js";

export { Operator };

export interface Expression {
  operator: Operator | null;
  operands: Expression[];
  value: string | null;
}

const PAREN = "(";

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

const PRECEDENCE: ReadonlyMap<Operator, number> = new Map([
  [Operator.DOT, 90],
  [Operator.NEG, 80],
  [Operator.NOT, 80],
  [Operator.MUL, 70],
  [Operator.DIV, 70],
  [Operator.ADD, 60],
  [Operator.SUB, 60],
  [Operator.LT, 50],
  [Operator.LTE, 50],
  [Operator.GT, 50],
  [Operator.GTE, 50],
  [Operator.IN, 50],
  [Operator.EQ, 40],
  [Operator.NEQ, 40],
  [Operator.AND, 30],
  [Operator.OR, 20],
  [Operator.APPLY, 10],
]);

// Matches: symbol operators, word operators, parentheses, and plain values.
const TOKEN_PATTERN =
  /!=|<=|>=|[.+\-*/<>=()]|(?:and|or|not|in)(?=\s|[()]|$)|[^\s.+\-*/<>=()!]+/g;

interface OpEntry {
  operator: Operator | typeof PAREN;
  unary: boolean;
  precedence: number;
}

function popOperator(output: Expression[], ops: OpEntry[]): void {
  const { operator, unary } = ops.pop()! as { operator: Operator; unary: boolean };
  if (unary) {
    const operand = output.pop()!;
    output.push({ operator, operands: [operand], value: null });
  } else {
    const right = output.pop()!;
    const left = output.pop()!;
    output.push({ operator, operands: [left, right], value: null });
  }
}

function shouldPop(ops: OpEntry[], precedence: number): boolean {
  if (!ops.length) return false;
  const top = ops[ops.length - 1];
  return top.operator !== PAREN && top.precedence >= precedence;
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
  const applyPrecedence = PRECEDENCE.get(Operator.APPLY)!;

  for (const token of tokens) {
    if (token === PAREN) {
      if (!expectOperand) {
        while (shouldPop(ops, applyPrecedence)) {
          popOperator(output, ops);
        }
        ops.push({ operator: Operator.APPLY, unary: false, precedence: applyPrecedence });
      }
      ops.push({ operator: PAREN, unary: false, precedence: 0 });
      expectOperand = true;
      continue;
    }

    if (token === ")") {
      while (ops.length && ops[ops.length - 1].operator !== PAREN) {
        popOperator(output, ops);
      }
      ops.pop();
      expectOperand = false;
      continue;
    }

    if (expectOperand) {
      const op = UNARY_OPERATORS.get(token);
      if (op !== undefined) {
        ops.push({ operator: op, unary: true, precedence: PRECEDENCE.get(op)! });
        continue;
      }
    }

    if (!expectOperand) {
      const op = BINARY_OPERATORS.get(token);
      if (op !== undefined) {
        const precedence = PRECEDENCE.get(op)!;
        while (shouldPop(ops, precedence)) {
          popOperator(output, ops);
        }
        ops.push({ operator: op, unary: false, precedence });
        expectOperand = true;
        continue;
      }

      while (shouldPop(ops, applyPrecedence)) {
        popOperator(output, ops);
      }
      ops.push({ operator: Operator.APPLY, unary: false, precedence: applyPrecedence });
    }

    output.push({ operator: null, operands: [], value: token });
    expectOperand = false;
  }

  while (ops.length) {
    popOperator(output, ops);
  }

  return output[0];
}
