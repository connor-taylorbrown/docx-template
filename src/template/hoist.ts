import type { Element } from "./parser.js";
import type { VirtualNode } from "./virtual-node.js";

/**
 * A matched pair of start/end boundary nodes for a block element.
 */
export interface BoundaryPair {
  start: VirtualNode;
  end: VirtualNode;
  element: Element;
}

/**
 * Identify block element boundary pairs via breadth-first traversal.
 *
 * Uses a per-level stack to enforce:
 * - Invariant #1: start and end nodes are at equal depth.
 * - Correct nesting order (LIFO) within each level.
 *
 * Simple elements (element.id === node.id) are ignored.
 * Nodes with no element and id < 0 (containers, plain content) are ignored.
 */
export function findBoundaries(root: VirtualNode): BoundaryPair[] {
  const pairs: BoundaryPair[] = [];
  let queue: VirtualNode[] = [...root.children];

  while (queue.length > 0) {
    const nextQueue: VirtualNode[] = [];
    const levelStack: VirtualNode[] = [];

    for (const node of queue) {
      if (node.element === null && node.id >= 0) {
        // Start tag: no element returned, valid parser ID
        levelStack.push(node);
      } else if (node.element !== null && node.element.id !== node.id) {
        // End tag: element.id is the start tag's ID, differs from own ID
        const start = levelStack.pop();
        if (!start || start.id !== node.element.id) {
          throw new SyntaxError("Block boundary depth mismatch");
        }
        pairs.push({ start, end: node, element: node.element });
      }
      // Simple elements (element.id === node.id) and containers (id < 0): skip

      for (const child of node.children) {
        nextQueue.push(child);
      }
    }

    if (levelStack.length > 0) {
      throw new SyntaxError("Block boundary depth mismatch");
    }

    queue = nextQueue;
  }

  return pairs;
}

/**
 * Extract the DOM tag name from a VirtualNode's content.
 */
function domTag(node: VirtualNode): string | null {
  if (node.content === null) return null;
  return node.content.tagName();
}

/**
 * Walk from start and end toward their common ancestor using parent
 * pointers. At each step, validate:
 * - Invariant #2: DOM tags are equal.
 *
 * Then copy id and element onto the ancestor-level endpoints.
 */
function hoistPair(pair: BoundaryPair): void {
  let startNode = pair.start;
  let endNode = pair.end;
  const [startRaw, endRaw] = pair.element.tags.map(t => t.trim());

  // Walk up until parents are identical
  while (startNode.parent !== endNode.parent) {
    const sp = startNode.parent;
    const ep = endNode.parent;
    if (!sp || !ep) {
      throw new SyntaxError("Block boundaries have no common ancestor");
    }

    // Invariant #2: DOM tags must match at each level
    if (domTag(sp) !== domTag(ep)) {
      throw new SyntaxError(
        `Block boundary DOM tag mismatch: ${domTag(sp)} vs ${domTag(ep)}`,
      );
    }

    // Invariant #3: text must exclusively match raw tag
    if (sp.content.text().trim() !== startRaw) {
      throw new SyntaxError(
        "Block boundary contains content beyond the start tag",
      );
    }
    if (ep.content.text().trim() !== endRaw) {
      throw new SyntaxError(
        "Block boundary contains content beyond the end tag",
      );
    }

    startNode = sp;
    endNode = ep;
  }

  // Hoist: copy id and element onto the ancestor-level nodes
  if (startNode !== pair.start) {
    startNode.id = pair.start.id;
    startNode.element = pair.start.element;
  }
  if (endNode !== pair.end) {
    endNode.id = pair.end.id;
    endNode.element = pair.element;
  }
}

/**
 * Validate and hoist all boundary pairs. Processes inner (shallower)
 * pairs first since findBoundaries returns them in BFS order.
 */
export function hoist(pairs: BoundaryPair[]): void {
  for (const pair of pairs) {
    hoistPair(pair);
  }
}
