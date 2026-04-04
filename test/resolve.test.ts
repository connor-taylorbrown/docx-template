import { describe, it, expect } from "vitest";
import { parse } from "../src/template/expression.js";
import { Operator } from "../src/template/operator.js";
import { Resolver, TypedElement, TypeHint, FunctionRegistry } from "../src/analysis/resolve.js";

function emptyRegistry(): FunctionRegistry {
  return { lookup: () => null };
}

function fakeRegistry(entries: Record<string, TypeHint[]>): FunctionRegistry {
  const map = new Map(Object.entries(entries));
  return {
    lookup(name) {
      const sig = map.get(name);
      return sig ? [...sig] : null;
    },
  };
}

function leaf(value: string): TypedElement {
  return { operator: null, operands: [], value, rule: null, returnType: null };
}

describe("Resolver", () => {
  describe("leaves", () => {
    it("plain reference", () => {
      const r = new Resolver(emptyRegistry());
      expect(r.resolve(parse("x"))).toEqual(leaf("x"));
    });

    it("integer literal sets returnType", () => {
      const r = new Resolver(emptyRegistry());
      const result = r.resolve(parse("42"));
      expect(result.returnType).toEqual({
        strong: true,
        type: { kind: "number", integer: true },
      });
      expect(result.value).toBe("42");
    });

    it("decimal literal sets returnType", () => {
      const r = new Resolver(emptyRegistry());
      const result = r.resolve(parse("3.14"));
      expect(result.returnType).toEqual({
        strong: true,
        type: { kind: "number" },
      });
      expect(result.value).toBe("3.14");
    });

    it("non-literal has null returnType", () => {
      const r = new Resolver(emptyRegistry());
      expect(r.resolve(parse("x")).returnType).toBeNull();
    });
  });

  describe("unary operators", () => {
    it("negation", () => {
      const r = new Resolver(emptyRegistry());
      expect(r.resolve(parse("-x"))).toEqual({
        operator: Operator.NEG, operands: [leaf("x")], value: null,
        rule: null, returnType: null,
      });
    });

    it("not", () => {
      const r = new Resolver(emptyRegistry());
      expect(r.resolve(parse("not x"))).toEqual({
        operator: Operator.NOT, operands: [leaf("x")], value: null,
        rule: null, returnType: null,
      });
    });
  });

  describe("DOT", () => {
    it("valid", () => {
      const r = new Resolver(emptyRegistry());
      expect(r.resolve(parse("a.b"))).toEqual({
        operator: Operator.DOT, operands: [leaf("a"), leaf("b")], value: null,
        rule: null, returnType: null,
      });
    });

    it("nested chain", () => {
      const r = new Resolver(emptyRegistry());
      const result = r.resolve(parse("a.b.c"));
      expect(result).toEqual({
        operator: Operator.DOT,
        operands: [
          {
            operator: Operator.DOT, operands: [leaf("a"), leaf("b")], value: null,
            rule: null, returnType: null,
          },
          leaf("c"),
        ],
        value: null, rule: null, returnType: null,
      });
    });

    it("rejects expression on right", () => {
      const r = new Resolver(emptyRegistry());
      expect(() => r.resolve(parse("a.(b + c)"))).toThrow(
        "DOT right operand must be a plain name",
      );
    });
  });

  describe("binary operators", () => {
    it("add", () => {
      const r = new Resolver(emptyRegistry());
      expect(r.resolve(parse("a + b"))).toEqual({
        operator: Operator.ADD, operands: [leaf("a"), leaf("b")], value: null,
        rule: null, returnType: null,
      });
    });

    it("preserves precedence", () => {
      const r = new Resolver(emptyRegistry());
      expect(r.resolve(parse("a + b * c"))).toEqual({
        operator: Operator.ADD,
        operands: [
          leaf("a"),
          {
            operator: Operator.MUL, operands: [leaf("b"), leaf("c")], value: null,
            rule: null, returnType: null,
          },
        ],
        value: null, rule: null, returnType: null,
      });
    });
  });

  describe("APPLY", () => {
    const P1: TypeHint = { strong: true, type: { kind: "number" } };
    const P2: TypeHint = { strong: false, type: { kind: "string" } };
    const P3: TypeHint = { strong: true, type: { kind: "boolean" } };
    const Ret: TypeHint = { strong: false, type: { kind: "number" } };

    it("1 arg", () => {
      const r = new Resolver(fakeRegistry({ fn: [P1, Ret] }));
      expect(r.resolve(parse("fn a"))).toEqual({
        operator: Operator.APPLY,
        operands: [leaf("fn"), leaf("a")],
        value: null,
        rule: P1,
        returnType: Ret,
      });
    });

    it("2 args", () => {
      const r = new Resolver(fakeRegistry({ fn: [P2, P1, Ret] }));
      const result = r.resolve(parse("fn a b"));
      // Outer APPLY
      expect(result.rule).toEqual(P2);
      expect(result.returnType).toEqual(Ret);
      // Inner APPLY
      const inner = result.operands[0];
      expect(inner.operator).toBe(Operator.APPLY);
      expect(inner.rule).toEqual(P1);
      expect(inner.returnType).toBeNull();
    });

    it("3 args", () => {
      const r = new Resolver(fakeRegistry({ fn: [P3, P2, P1, Ret] }));
      const result = r.resolve(parse("fn a b c"));
      // Outermost: rule = P3
      expect(result.rule).toEqual(P3);
      expect(result.returnType).toEqual(Ret);
      // Middle: rule = P2
      const middle = result.operands[0];
      expect(middle.rule).toEqual(P2);
      expect(middle.returnType).toBeNull();
      // Innermost: rule = P1
      const inner = middle.operands[0];
      expect(inner.rule).toEqual(P1);
      expect(inner.returnType).toBeNull();
    });

    it("expression argument", () => {
      const r = new Resolver(fakeRegistry({ fn: [P1, Ret] }));
      const result = r.resolve(parse("fn (a + b)"));
      expect(result.rule).toEqual(P1);
      expect(result.returnType).toEqual(Ret);
      // The ADD subtree has no rules
      const addNode = result.operands[1];
      expect(addNode.operator).toBe(Operator.ADD);
      expect(addNode.rule).toBeNull();
      expect(addNode.returnType).toBeNull();
    });

    it("nested calls", () => {
      const r = new Resolver(fakeRegistry({
        fn: [P1, Ret],
        g: [P2, Ret],
      }));
      const result = r.resolve(parse("fn (g x)"));
      // Outer APPLY: fn applied to (g x)
      expect(result.rule).toEqual(P1);
      expect(result.returnType).toEqual(Ret);
      // Inner APPLY: g applied to x
      const inner = result.operands[1];
      expect(inner.operator).toBe(Operator.APPLY);
      expect(inner.rule).toEqual(P2);
      expect(inner.returnType).toEqual(Ret);
    });

    it("too many arguments", () => {
      const r = new Resolver(fakeRegistry({ fn: [P1, Ret] }));
      expect(() => r.resolve(parse("fn a b"))).toThrow(
        "Too many arguments for function 'fn'",
      );
    });

    it("too few arguments (remainder discarded)", () => {
      const r = new Resolver(fakeRegistry({ fn: [P3, P2, P1, Ret] }));
      const result = r.resolve(parse("fn a"));
      expect(result.rule).toEqual(P1);
      expect(result.returnType).toEqual(Ret);
    });

    it("non-name left operand", () => {
      const r = new Resolver(emptyRegistry());
      expect(() => r.resolve(parse("(a + b) c"))).toThrow(
        "Left operand of function call must be a name",
      );
    });

    it("unknown function", () => {
      const r = new Resolver(emptyRegistry());
      expect(() => r.resolve(parse("fn a"))).toThrow("Unknown function 'fn'");
    });

    it("DOT in argument", () => {
      const r = new Resolver(fakeRegistry({ fn: [P1, Ret] }));
      const result = r.resolve(parse("fn a.b"));
      expect(result.rule).toEqual(P1);
      const dot = result.operands[1];
      expect(dot.operator).toBe(Operator.DOT);
      expect(dot.rule).toBeNull();
    });

    it("APPLY result in DOT", () => {
      const r = new Resolver(fakeRegistry({ fn: [P1, Ret] }));
      const result = r.resolve(parse("(fn a).b"));
      expect(result.operator).toBe(Operator.DOT);
      expect(result.rule).toBeNull();
      const apply = result.operands[0];
      expect(apply.operator).toBe(Operator.APPLY);
      expect(apply.rule).toEqual(P1);
      expect(apply.returnType).toEqual(Ret);
    });
  });
});
