/**
 * Abstract base for all nodes in a document tree. Common ancestor for
 * both tree-level nodes (paragraphs, containers) and inline-level
 * nodes (runs), enabling generic covariance across parser levels.
 */
export abstract class DocumentNode {}
