import { describe, it, expect } from "vitest";
import { Expression, Operator, parse } from "../src/template/expression.js";
import { Literal } from "../src/template/operator.js";

function leaf(value: string): Expression {
  return { operator: null, operands: [], value, literal: null };
}

function literal(value: string, kind: Literal): Expression {
  return { operator: null, operands: [], value, literal: kind };
}

function unary(operator: Operator, operand: Expression): Expression {
  return { operator, operands: [operand], value: null, literal: null };
}

function binary(
  operator: Operator,
  left: Expression,
  right: Expression,
): Expression {
  return { operator, operands: [left, right], value: null, literal: null };
}

describe("parse", () => {
  describe("leaves", () => {
    it("single reference", () => {
      expect(parse("name")).toEqual(leaf("name"));
    });

    it("integer literal", () => {
      expect(parse("42")).toEqual(literal("42", Literal.INTEGER));
    });

    it("decimal literal", () => {
      expect(parse("3.14")).toEqual(literal("3.14", Literal.DECIMAL));
    });

    it("zero literal", () => {
      expect(parse("0")).toEqual(literal("0", Literal.INTEGER));
    });

    it("decimal with zero prefix", () => {
      expect(parse("0.5")).toEqual(literal("0.5", Literal.DECIMAL));
    });

    it("trims whitespace", () => {
      expect(parse("  name  ")).toEqual(leaf("name"));
    });
  });

  describe("single binary operators", () => {
    it("dot", () => {
      expect(parse("a.b")).toEqual(
        binary(Operator.DOT, leaf("a"), leaf("b")),
      );
    });

    it("add", () => {
      expect(parse("a + b")).toEqual(
        binary(Operator.ADD, leaf("a"), leaf("b")),
      );
    });

    it("sub", () => {
      expect(parse("a - b")).toEqual(
        binary(Operator.SUB, leaf("a"), leaf("b")),
      );
    });

    it("mul", () => {
      expect(parse("a * b")).toEqual(
        binary(Operator.MUL, leaf("a"), leaf("b")),
      );
    });

    it("div", () => {
      expect(parse("a / b")).toEqual(
        binary(Operator.DIV, leaf("a"), leaf("b")),
      );
    });

    it("lt", () => {
      expect(parse("a < b")).toEqual(
        binary(Operator.LT, leaf("a"), leaf("b")),
      );
    });

    it("lte", () => {
      expect(parse("a <= b")).toEqual(
        binary(Operator.LTE, leaf("a"), leaf("b")),
      );
    });

    it("gt", () => {
      expect(parse("a > b")).toEqual(
        binary(Operator.GT, leaf("a"), leaf("b")),
      );
    });

    it("gte", () => {
      expect(parse("a >= b")).toEqual(
        binary(Operator.GTE, leaf("a"), leaf("b")),
      );
    });

    it("eq", () => {
      expect(parse("a = b")).toEqual(
        binary(Operator.EQ, leaf("a"), leaf("b")),
      );
    });

    it("neq", () => {
      expect(parse("a != b")).toEqual(
        binary(Operator.NEQ, leaf("a"), leaf("b")),
      );
    });

    it("and", () => {
      expect(parse("a and b")).toEqual(
        binary(Operator.AND, leaf("a"), leaf("b")),
      );
    });

    it("or", () => {
      expect(parse("a or b")).toEqual(
        binary(Operator.OR, leaf("a"), leaf("b")),
      );
    });

    it("in", () => {
      expect(parse("a in b")).toEqual(
        binary(Operator.IN, leaf("a"), leaf("b")),
      );
    });
  });

  describe("unary operators", () => {
    it("negation", () => {
      expect(parse("-a")).toEqual(unary(Operator.NEG, leaf("a")));
    });

    it("not", () => {
      expect(parse("not a")).toEqual(unary(Operator.NOT, leaf("a")));
    });

    it("unary before binary", () => {
      expect(parse("-a + b")).toEqual(
        binary(Operator.ADD, unary(Operator.NEG, leaf("a")), leaf("b")),
      );
    });

    it("unary chain", () => {
      expect(parse("not not a")).toEqual(
        unary(Operator.NOT, unary(Operator.NOT, leaf("a"))),
      );
    });

    it("binary then unary", () => {
      expect(parse("a - -b")).toEqual(
        binary(Operator.SUB, leaf("a"), unary(Operator.NEG, leaf("b"))),
      );
    });
  });

  describe("precedence", () => {
    it("mul before add", () => {
      expect(parse("a + b * c")).toEqual(
        binary(
          Operator.ADD,
          leaf("a"),
          binary(Operator.MUL, leaf("b"), leaf("c")),
        ),
      );
    });

    it("mul before add (reversed)", () => {
      expect(parse("a * b + c")).toEqual(
        binary(
          Operator.ADD,
          binary(Operator.MUL, leaf("a"), leaf("b")),
          leaf("c"),
        ),
      );
    });

    it("div and mul equal precedence, left-to-right", () => {
      expect(parse("a / b * c")).toEqual(
        binary(
          Operator.MUL,
          binary(Operator.DIV, leaf("a"), leaf("b")),
          leaf("c"),
        ),
      );
    });

    it("sub and add equal precedence, left-to-right", () => {
      expect(parse("a - b + c")).toEqual(
        binary(
          Operator.ADD,
          binary(Operator.SUB, leaf("a"), leaf("b")),
          leaf("c"),
        ),
      );
    });

    it("equality above and", () => {
      expect(parse("a = b and c = d")).toEqual(
        binary(
          Operator.AND,
          binary(Operator.EQ, leaf("a"), leaf("b")),
          binary(Operator.EQ, leaf("c"), leaf("d")),
        ),
      );
    });

    it("and above or", () => {
      expect(parse("a or b and c")).toEqual(
        binary(
          Operator.OR,
          leaf("a"),
          binary(Operator.AND, leaf("b"), leaf("c")),
        ),
      );
    });

    it("dot above arithmetic", () => {
      expect(parse("a.b + c")).toEqual(
        binary(
          Operator.ADD,
          binary(Operator.DOT, leaf("a"), leaf("b")),
          leaf("c"),
        ),
      );
    });

    it("comparison above equality", () => {
      expect(parse("a < b = c > d")).toEqual(
        binary(
          Operator.EQ,
          binary(Operator.LT, leaf("a"), leaf("b")),
          binary(Operator.GT, leaf("c"), leaf("d")),
        ),
      );
    });

    it("in above or", () => {
      expect(parse("a in b or c")).toEqual(
        binary(
          Operator.OR,
          binary(Operator.IN, leaf("a"), leaf("b")),
          leaf("c"),
        ),
      );
    });

    it("arithmetic above in", () => {
      expect(parse("a in b * c")).toEqual(
        binary(
          Operator.IN,
          leaf("a"),
          binary(Operator.MUL, leaf("b"), leaf("c")),
        ),
      );
    });
  });

  describe("parentheses", () => {
    it("override precedence", () => {
      expect(parse("(a + b) * c")).toEqual(
        binary(
          Operator.MUL,
          binary(Operator.ADD, leaf("a"), leaf("b")),
          leaf("c"),
        ),
      );
    });

    it("right-hand grouping", () => {
      expect(parse("a * (b + c)")).toEqual(
        binary(
          Operator.MUL,
          leaf("a"),
          binary(Operator.ADD, leaf("b"), leaf("c")),
        ),
      );
    });

    it("nested parentheses", () => {
      expect(parse("((a))")).toEqual(leaf("a"));
    });
  });

  describe("decimal literals in expressions", () => {
    it("add with decimal", () => {
      expect(parse("a + 3.14")).toEqual(
        binary(Operator.ADD, leaf("a"), literal("3.14", Literal.DECIMAL)),
      );
    });

    it("mul with decimal", () => {
      expect(parse("a * 3.14")).toEqual(
        binary(Operator.MUL, leaf("a"), literal("3.14", Literal.DECIMAL)),
      );
    });

    it("negated decimal", () => {
      expect(parse("-3.14")).toEqual(
        unary(Operator.NEG, literal("3.14", Literal.DECIMAL)),
      );
    });

    it("decimal does not consume dot from property access", () => {
      expect(parse("a.b + 3.14")).toEqual(
        binary(
          Operator.ADD,
          binary(Operator.DOT, leaf("a"), leaf("b")),
          literal("3.14", Literal.DECIMAL),
        ),
      );
    });

    it("integer in arithmetic carries literal hint", () => {
      expect(parse("a + 1")).toEqual(
        binary(Operator.ADD, leaf("a"), literal("1", Literal.INTEGER)),
      );
    });
  });

  describe("dot references", () => {
    it("chain", () => {
      expect(parse("a.b.c")).toEqual(
        binary(
          Operator.DOT,
          binary(Operator.DOT, leaf("a"), leaf("b")),
          leaf("c")
        )
      )
    });

    it("after parenthesised expression", () => {
      expect(parse("(fn a).b")).toEqual(
        binary(
          Operator.DOT,
          binary(Operator.APPLY, leaf("fn"), leaf("a")),
          leaf("b"),
        )
      );
    });
  })

  describe("function invocation", () => {
    it("single argument", () => {
      expect(parse("fn a")).toEqual(
        binary(Operator.APPLY, leaf("fn"), leaf("a")),
      );
    });

    it("two arguments", () => {
      expect(parse("fn a b")).toEqual(
        binary(
          Operator.APPLY,
          binary(Operator.APPLY, leaf("fn"), leaf("a")),
          leaf("b"),
        ),
      );
    });

    it("argument with higher-precedence expression", () => {
      expect(parse("fn (a + b)")).toEqual(
        binary(
          Operator.APPLY,
          leaf("fn"),
          binary(Operator.ADD, leaf("a"), leaf("b")),
        ),
      );
    });

    it("lowest precedence", () => {
      expect(parse("fn a + b")).toEqual(
        binary(
          Operator.APPLY,
          leaf("fn"),
          binary(Operator.ADD, leaf("a"), leaf("b")),
        ),
      );
    });
  });
});
