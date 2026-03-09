/**
 * Simple queue with O(1) amortised dequeue.
 */
export class Queue<T> {
  private items: T[];
  private head = 0;

  constructor(items: T[] = []) {
    this.items = items;
  }

  isEmpty(): boolean {
    return this.head >= this.items.length;
  }

  /** Peek at the front element without removing it. */
  next(): T {
    if (this.isEmpty()) throw new Error("Queue is empty");
    return this.items[this.head];
  }

  /** Remove and return the front element. */
  dequeue(): T {
    if (this.isEmpty()) throw new Error("Queue is empty");
    return this.items[this.head++];
  }

  enqueue(item: T): void {
    this.items.push(item);
  }

  /** Drain all remaining elements into an array and clear the queue. */
  drain(): T[] {
    const rest = this.items.slice(this.head);
    this.head = this.items.length;
    return rest;
  }
}
