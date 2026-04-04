import { Run } from "../src/template/document.js";

/**
 * Concrete Run backed by a plain string, for testing.
 * Tracks a label to verify identity through split/merge operations.
 */
export class TestRun extends Run {
  constructor(private readonly _text: string) {
    super();
  }

  text(): string {
    return this._text;
  }

  tagName(): string | null {
    return null;
  }

  get length(): number {
    return this._text.length;
  }

  split(offset: number): [TestRun, TestRun] {
    return [
      new TestRun(this._text.slice(0, offset)),
      new TestRun(this._text.slice(offset)),
    ];
  }

  merge(queue: Run[]): TestRun {
    const parts = [this._text];
    for (const run of queue) {
      if (!(run instanceof TestRun)) throw new Error("Expected TestRun");
      parts.push(run.text());
    }
    return new TestRun(parts.join(""));
  }
}
