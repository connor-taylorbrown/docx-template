import { TreeNode } from "./document.js";
import { detectIsolatedTag } from "./tag.js";
import { Parser, Element } from "./parser.js";
import { ParagraphReader } from "./paragraph-reader.js";
import { VirtualNode } from "./virtual-node.js";

export { TreeNode } from "./document.js";

/**
 * Recursive document tree reader. Traverses a document tree in order,
 * mapping each node to a VirtualNode. Paragraphs are classified as
 * either isolated tags or inline-parsed content; containers are
 * recursed into. A Parser tracks scope across the full tree.
 */
export class TreeReader {
  private readonly parser = new Parser();

  /**
   * Recursively map a TreeNode to a VirtualNode.
   *
   * - Paragraph with isolated tag: creates a tagged VirtualNode,
   *   pushes tag to parser.
   * - Other paragraph: delegates to ParagraphReader.
   * - Container: recurses into children.
   */
  classify(node: TreeNode): VirtualNode {
    const children: VirtualNode[] = [];

    for (const child of node.children()) {
      if (child.isParagraph()) {
        const tag = detectIsolatedTag(child.text());
        if (tag) {
          const { id, element } = this.parser.addTag(tag);
          children.push(
            new VirtualNode({
              content: child,
              id,
              element,
              children: [],
            }),
          );
        } else {
          const paragraphReader = new ParagraphReader();
          children.push(paragraphReader.classify(child.paragraphView()));
          this.parser.addCollection(paragraphReader.result());
        }
      } else {
        children.push(this.classify(child));
      }
    }

    return new VirtualNode({
      content: node,
      id: -1,
      element: null,
      children,
    });
  }

  /**
   * Finalise parsing after the tree has been classified.
   * Returns the root element list. Throws on unclosed blocks.
   */
  result(): Element[] {
    return this.parser.parse();
  }
}
