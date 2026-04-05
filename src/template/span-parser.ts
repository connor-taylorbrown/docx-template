import { Queue } from "../queue.js";
import { VirtualNode } from "./virtual-node.js";

/**
 * Parses flat sibling sequences of VirtualNodes, consuming start/end
 * boundary pairs and replacing them with prototype VirtualNodes.
 */
export class SpanParser {
  private readonly queue: Queue<VirtualNode>;

  constructor(input: VirtualNode[]) {
    this.queue = new Queue(input);
  }

  write(output: VirtualNode[]): void {
    while (!this.queue.isEmpty()) {
      output.push(this.parse());
    }
  }

  private parse(): VirtualNode {
    const node = this.queue.dequeue();

    // No-op: content node (id < 0), simple element (element.id === node.id),
    // or already-prototyped node (has element)
    if (node.element !== null || node.id < 0) {
      return node;
    }

    // Prototype: start boundary — collect children until matching end
    const startId = node.id;
    const children: VirtualNode[] = [];

    while (!this.queue.isEmpty()) {
      const next = this.queue.next();
      if (next.element && next.element.id === startId) {
        // End boundary found — consume it, build prototype node
        const end = this.queue.dequeue();
        return new VirtualNode({
          content: null,
          id: end.element!.id,
          element: end.element,
          children,
        });
      }
      children.push(this.parse());
    }

    throw new SyntaxError("Unmatched start boundary in prototype stage");
  }
}

/**
 * Post-order traversal: prototype children first, then apply SpanParser
 * to the current node's children.
 */
export function prototype(root: VirtualNode): void {
  for (const child of root.children) {
    prototype(child);
  }
  const input = root.children.splice(0);
  const parser = new SpanParser(input);
  parser.write(root.children);
}
