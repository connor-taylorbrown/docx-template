import { describe, it, expect } from "vitest";
import { Expression, parse } from "../src/template/expression.js";

function leaf(value: string): Expression {
  return { operator: null, operands: [], value };
}

function unary(operator: string, operand: Expression): Expression {
  return { operator, operands: [operand], value: null };
}

function binary(
  operator: string,
  left: Expression,
  right: Expression,
): Expression {
  return { operator, operands: [left, right], value: null };
}

describe("parse", () => {
  describe("leaves", () => {
    it("single reference", () => {
      expect(parse("name")).toEqual(leaf("name"));
    });

    it("numeric literal", () => {
      expect(parse("42")).toEqual(leaf("42"));
    });

    it("trims whitespace", () => {
      expect(parse("  name  ")).toEqual(leaf("name"));
    });
  });

  describe("single binary operators", () => {
    it("dot", () => {
      expect(parse("a.b")).toEqual(binary(".", leaf("a"), leaf("b")));
    });

    it("add", () => {
      expect(parse("a + b")).toEqual(binary("+", leaf("a"), leaf("b")));
    });

    it("sub", () => {
      expect(parse("a - b")).toEqual(binary("-", leaf("a"), leaf("b")));
    });

    it("mul", () => {
      expect(parse("a * b")).toEqual(binary("*", leaf("a"), leaf("b")));
    });

    it("div", () => {
      expect(parse("a / b")).toEqual(binary("/", leaf("a"), leaf("b")));
    });

    it("lt", () => {
      expect(parse("a < b")).toEqual(binary("<", leaf("a"), leaf("b")));
    });

    it("lte", () => {
      expect(parse("a <= b")).toEqual(binary("<=", leaf("a"), leaf("b")));
    });

    it("gt", () => {
      expect(parse("a > b")).toEqual(binary(">", leaf("a"), leaf("b")));
    });

    it("gte", () => {
      expect(parse("a >= b")).toEqual(binary(">=", leaf("a"), leaf("b")));
    });

    it("eq", () => {
      expect(parse("a = b")).toEqual(binary("=", leaf("a"), leaf("b")));
    });

    it("neq", () => {
      expect(parse("a != b")).toEqual(binary("!=", leaf("a"), leaf("b")));
    });

    it("and", () => {
      expect(parse("a and b")).toEqual(binary("and", leaf("a"), leaf("b")));
    });

    it("or", () => {
      expect(parse("a or b")).toEqual(binary("or", leaf("a"), leaf("b")));
    });

    it("in", () => {
      expect(parse("a in b")).toEqual(binary("in", leaf("a"), leaf("b")));
    });
  });

  describe("unary operators", () => {
    it("negation", () => {
      expect(parse("-a")).toEqual(unary("-", leaf("a")));
    });

    it("not", () => {
      expect(parse("not a")).toEqual(unary("not", leaf("a")));
    });

    it("unary before binary", () => {
      expect(parse("-a + b")).toEqual(
        binary("+", unary("-", leaf("a")), leaf("b")),
      );
    });

    it("unary chain", () => {
      expect(parse("not not a")).toEqual(
        unary("not", unary("not", leaf("a"))),
      );
    });

    it("binary then unary", () => {
      expect(parse("a - -b")).toEqual(
        binary("-", leaf("a"), unary("-", leaf("b"))),
      );
    });
  });

  describe("precedence", () => {
    it("mul before add", () => {
      expect(parse("a + b * c")).toEqual(
        binary("+", leaf("a"), binary("*", leaf("b"), leaf("c"))),
      );
    });

    it("mul before add (reversed)", () => {
      expect(parse("a * b + c")).toEqual(
        binary("+", binary("*", leaf("a"), leaf("b")), leaf("c")),
      );
    });

    it("div and mul equal precedence, left-to-right", () => {
      expect(parse("a / b * c")).toEqual(
        binary("*", binary("/", leaf("a"), leaf("b")), leaf("c")),
      );
    });

    it("sub and add equal precedence, left-to-right", () => {
      expect(parse("a - b + c")).toEqual(
        binary("+", binary("-", leaf("a"), leaf("b")), leaf("c")),
      );
    });

    it("equality above and", () => {
      expect(parse("a = b and c = d")).toEqual(
        binary(
          "and",
          binary("=", leaf("a"), leaf("b")),
          binary("=", leaf("c"), leaf("d")),
        ),
      );
    });

    it("and above or", () => {
      expect(parse("a or b and c")).toEqual(
        binary("or", leaf("a"), binary("and", leaf("b"), leaf("c"))),
      );
    });

    it("dot above arithmetic", () => {
      expect(parse("a.b + c")).toEqual(
        binary("+", binary(".", leaf("a"), leaf("b")), leaf("c")),
      );
    });

    it("comparison above equality", () => {
      expect(parse("a < b = c > d")).toEqual(
        binary(
          "=",
          binary("<", leaf("a"), leaf("b")),
          binary(">", leaf("c"), leaf("d")),
        ),
      );
    });

    it("in above or", () => {
      expect(parse("a in b or c")).toEqual(
        binary("or", binary("in", leaf("a"), leaf("b")), leaf("c")),
      );
    });

    it("arithmetic above in", () => {
      expect(parse("a in b * c")).toEqual(
        binary("in", leaf("a"), binary("*", leaf("b"), leaf("c"))),
      );
    });
  });

  describe("parentheses", () => {
    it("override precedence", () => {
      expect(parse("(a + b) * c")).toEqual(
        binary("*", binary("+", leaf("a"), leaf("b")), leaf("c")),
      );
    });

    it("right-hand grouping", () => {
      expect(parse("a * (b + c)")).toEqual(
        binary("*", leaf("a"), binary("+", leaf("b"), leaf("c"))),
      );
    });

    it("nested parentheses", () => {
      expect(parse("((a))")).toEqual(leaf("a"));
    });
  });

  describe("function invocation", () => {
    it("single argument", () => {
      expect(parse("fn a")).toEqual(binary("", leaf("fn"), leaf("a")));
    });

    it("two arguments", () => {
      expect(parse("fn a b")).toEqual(
        binary("", binary("", leaf("fn"), leaf("a")), leaf("b")),
      );
    });

    it("argument with higher-precedence expression", () => {
      expect(parse("fn (a + b)")).toEqual(
        binary("", leaf("fn"), binary("+", leaf("a"), leaf("b"))),
      );
    });

    it("lowest precedence", () => {
      expect(parse("fn a + b")).toEqual(
        binary("", leaf("fn"), binary("+", leaf("a"), leaf("b"))),
      );
    });
  });
});
