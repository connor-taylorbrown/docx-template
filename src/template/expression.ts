export interface Expression {
  operator: string | null;
  operands: Expression[];
  value: string | null;
}

const PAREN = "(";
const APPLY = "";

const BINARY_PRECEDENCE: ReadonlyMap<string, number> = new Map([
  [".", 90],
  ["/", 70],
  ["*", 70],
  ["+", 60],
  ["-", 60],
  ["<", 50],
  ["<=", 50],
  [">", 50],
  [">=", 50],
  ["in", 50],
  ["=", 40],
  ["!=", 40],
  ["and", 30],
  ["or", 20],
  [APPLY, 10],
]);

const UNARY_PRECEDENCE: ReadonlyMap<string, number> = new Map([
  ["-", 80],
  ["not", 80],
]);

// Matches: symbol operators, word operators, parentheses, dot-separated
// references, and plain values. Dot is handled by splitting references after
// tokenization to keep the regex simple.
const TOKEN_PATTERN =
  /!=|<=|>=|[+\-*/<>=()]|(?:and|or|not|in)(?=\s|[()]|$)|[^\s+\-*/<>=()!]+/g;

interface OpEntry {
  operator: string;
  unary: boolean;
  precedence: number;
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
    expr = { operator: ".", operands: [expr, right], value: null };
  }
  return expr;
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

  for (const token of tokens) {
    if (token === PAREN) {
      if (!expectOperand) {
        const precedence = BINARY_PRECEDENCE.get(APPLY)!;
        while (shouldPop(ops, precedence)) {
          popOperator(output, ops);
        }
        ops.push({ operator: APPLY, unary: false, precedence });
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
      const precedence = UNARY_PRECEDENCE.get(token);
      if (precedence !== undefined) {
        ops.push({ operator: token, unary: true, precedence });
        continue;
      }
    }

    if (!expectOperand) {
      const precedence = BINARY_PRECEDENCE.get(token);
      if (precedence !== undefined) {
        while (shouldPop(ops, precedence)) {
          popOperator(output, ops);
        }
        ops.push({ operator: token, unary: false, precedence });
        expectOperand = true;
        continue;
      }

      const applyPrecedence = BINARY_PRECEDENCE.get(APPLY)!;
      while (shouldPop(ops, applyPrecedence)) {
        popOperator(output, ops);
      }
      ops.push({ operator: APPLY, unary: false, precedence: applyPrecedence });
    }

    output.push(expandDots(token));
    expectOperand = false;
  }

  while (ops.length) {
    popOperator(output, ops);
  }

  return output[0];
}
