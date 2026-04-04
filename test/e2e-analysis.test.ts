import { describe, it, expect } from "vitest";
import { ParagraphView, Run, TreeNode } from "../src/template/document.js";
import { TreeReader } from "../src/template/tree-reader.js";
import { analyse, ReferenceMap, TypeHint } from "../src/analysis/analyse.js";
import { Resolver } from "../src/analysis/resolve.js";
import { TestRun } from "./test-run.js";

type StructureType = { kind: "structure"; properties: Map<string, TypeHint> };
type CollectionType = { kind: "collection"; item?: TypeHint };

const resolver = new Resolver({ lookup: () => null });

class TestParagraphView extends ParagraphView {
  private _runs: TestRun[];

  constructor(runs: TestRun[]) {
    super();
    this._runs = runs;
  }

  text(): string {
    return this._runs.map((r) => r.text()).join("");
  }

  tagName(): string | null {
    return "p";
  }

  runs(): Run[] {
    return this._runs;
  }

  replaceChildren(runs: Run[]): void {
    this._runs = runs as TestRun[];
  }
}

class TestTreeNode extends TreeNode {
  private _children: TestTreeNode[];
  private _isParagraph: boolean;
  private _text: string;
  private _view: TestParagraphView;

  constructor(opts: {
    children?: TestTreeNode[];
    text?: string;
    runs?: TestRun[];
  }) {
    super();
    if (opts.children) {
      this._children = opts.children;
      this._isParagraph = false;
      this._text = "";
      this._view = new TestParagraphView([]);
    } else {
      this._children = [];
      this._isParagraph = true;
      const runs = opts.runs ?? [new TestRun(opts.text ?? "")];
      this._text = runs.map((r) => r.text()).join("");
      this._view = new TestParagraphView(runs);
    }
  }

  children(): TestTreeNode[] {
    return this._children;
  }

  isParagraph(): boolean {
    return this._isParagraph;
  }

  text(): string {
    return this._text;
  }

  tagName(): string | null {
    return this._isParagraph ? "p" : "div";
  }

  paragraphView(): ParagraphView {
    return this._view;
  }
}

function para(text: string): TestTreeNode {
  return new TestTreeNode({ text });
}

function container(...children: TestTreeNode[]): TestTreeNode {
  return new TestTreeNode({ children });
}

function pipeline(root: TestTreeNode): ReferenceMap {
  const reader = new TreeReader();
  reader.classify(root);
  const elements = reader.result();
  const refs = ReferenceMap.create();
  for (const element of elements) {
    analyse(element, refs, resolver);
  }
  return refs;
}

describe("e2e: TreeReader → analyse", () => {
  it("E1 — simple element", () => {
    const refs = pipeline(container(para("{{name}}")));
    expect(refs.get("name")!.strong).toBe(false);
    expect(refs.get("name")!.type.kind).toBe("string");
  });

  it("E2 — #if block", () => {
    const refs = pipeline(container(
      para("{{#if active}}"),
      para("{{x}}"),
      para("{{#end}}"),
    ));
    expect(refs.get("active")!.type.kind).toBe("boolean");
    expect(refs.get("x")!.type.kind).toBe("string");
  });

  it("E3 — #each block", () => {
    const refs = pipeline(container(
      para("{{#each item in items}}"),
      para("{{item.name}}"),
      para("{{#end}}"),
    ));
    expect(refs.get("items")!.strong).toBe(true);
    expect(refs.get("items")!.type.kind).toBe("collection");
    const itemType = (refs.get("items")!.type as CollectionType).item;
    expect(itemType).toBeDefined();
    expect(itemType!.type.kind).toBe("structure");
    const props = (itemType!.type as StructureType).properties;
    expect(props.has("name")).toBe(true);
  });

  it("E4 — nested blocks", () => {
    const refs = pipeline(container(
      para("{{#each i in x}}"),
      para("{{#if i.active}}"),
      para("{{i.name}}"),
      para("{{#end}}"),
      para("{{#end}}"),
    ));
    expect(refs.get("x")!.type.kind).toBe("collection");
    const xItem = (refs.get("x")!.type as CollectionType).item;
    expect(xItem!.type.kind).toBe("structure");
    const props = (xItem!.type as StructureType).properties;
    expect(props.has("active")).toBe(true);
    expect(props.has("name")).toBe(true);
  });

  it("E5 — inline tags in #if", () => {
    const refs = pipeline(container(
      para("{{#if show}}"),
      para("Hello {{name}} world"),
      para("{{#end}}"),
    ));
    expect(refs.get("show")!.type.kind).toBe("boolean");
    expect(refs.get("name")!.type.kind).toBe("string");
  });

  it("E6 — expression in simple element", () => {
    const refs = pipeline(container(para("{{a + b}}")));
    expect(refs.get("a")!.type.kind).toBe("string");
    expect(refs.get("b")!.type.kind).toBe("string");
  });

  it("E7 — expression in #if", () => {
    const refs = pipeline(container(
      para("{{#if a > b}}"),
      para("{{x}}"),
      para("{{#end}}"),
    ));
    expect(refs.get("a")!.strong).toBe(true);
    expect(refs.get("a")!.type.kind).toBe("number");
    expect(refs.get("b")!.strong).toBe(true);
    expect(refs.get("b")!.type.kind).toBe("number");
  });
});
