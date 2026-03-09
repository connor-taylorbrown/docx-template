import { Run } from "../src/template/run.js";

/**
 * Concrete Run backed by a plain string, for testing.
 * Tracks a label to verify identity through split/merge operations.
 */
export class TestRun extends Run {
  constructor(public readonly text: string) {
    super();
  }

  get length(): number {
    return this.text.length;
  }

  split(offset: number): [TestRun, TestRun] {
    return [
      new TestRun(this.text.slice(0, offset)),
      new TestRun(this.text.slice(offset)),
    ];
  }

  merge(queue: Run[]): TestRun {
    const parts = [this.text];
    for (const run of queue) {
      if (!(run instanceof TestRun)) throw new Error("Expected TestRun");
      parts.push(run.text);
    }
    return new TestRun(parts.join(""));
  }
}
