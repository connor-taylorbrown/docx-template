import { Tag } from "./tag.js";
import { Run } from "./document.js";
import { Queue } from "../queue.js";

export interface NormalisedEntry {
  tag: Tag | null;
  content: Run;
}

/**
 * Run normalisation: align run boundaries with tag boundaries so that
 * each tag maps 1:1 to a run node. Implements the algorithm from parser.md.
 *
 * @param runs - The paragraph's runs (consumed as a queue).
 * @param tags - Tag descriptors sorted by offset (consumed as a queue).
 * @returns Normalised entries pairing each resulting run with its tag (if any).
 */
export function normalise(runs: Run[], tags: Tag[]): NormalisedEntry[] {
  const runQueue = new Queue(runs);
  const tagQueue = new Queue(tags);
  const mergeQueue = new Queue<Run>();
  const finalQueue: NormalisedEntry[] = [];

  let runOffset = 0;

  while (!runQueue.isEmpty()) {
    let run: Run | null = runQueue.dequeue();

    while (run !== null && !tagQueue.isEmpty()) {
      const tag = tagQueue.next();
      const tagEnd = tag.offset + tag.length;
      const runEnd = runOffset + run.length;

      // Close after: tag extends beyond current run
      if (tagEnd > runEnd) {
        if (tag.offset >= runEnd) {
          // Open after: entire run precedes the tag
          finalQueue.push({ tag: null, content: run });
        } else if (tag.offset > runOffset) {
          // Open on: split off pre-tag content
          const [head, tail] = run.split(tag.offset - runOffset);
          finalQueue.push({ tag: null, content: head });
          mergeQueue.enqueue(tail);
        } else {
          // Open before (or exactly at run start): whole run joins merge queue
          mergeQueue.enqueue(run);
        }

        runOffset = runEnd;
        run = null;
        break;
      }

      // Close on: tag ends within (or exactly at end of) current run
      const end = tagEnd - runOffset;
      let head: Run;
      [head, run] = run.split(end);

      if (tag.offset > runOffset) {
        // Open on, close on: split off pre-tag content from head
        let left: Run;
        [left, head] = head.split(tag.offset - runOffset);
        finalQueue.push({ tag: null, content: left });
      }

      // Merge head with anything accumulated in the merge queue
      const content = mergeQueue.isEmpty()
        ? head
        : mergeQueue.dequeue().merge([...mergeQueue.drain(), head]);

      tagQueue.dequeue();
      finalQueue.push({ tag, content });
      runOffset = tagEnd;

      // If the split consumed the entire run, nothing left to process
      if (run.length === 0) {
        run = null;
      }
    }

    // Submit remainder if run wasn't fully consumed by tag processing
    if (run !== null) {
      finalQueue.push({ tag: null, content: run });
      runOffset += run.length;
    }
  }

  return finalQueue;
}
