# docx-template

Template engine for DOCX documents. Parses `{{tag}}` syntax from document trees, with dual implementations for browser DOM (interactive rendering via docx-preview) and OOXML/XML (document creation).

## Commands

- `npm test` — run tests (vitest)
- `npm run lint` — eslint
- `npx vitest run <file>` — run a single test file

## Tech

- TypeScript (ES2022, strict, bundler resolution)
- Vitest for testing, ESLint for linting
- ESM (`"type": "module"`)

## Key Files

### Template core (`src/template/`)
- `document.ts` — `ContentNode` interface, abstract `TreeNode`, `ParagraphView`, `Run` (DOM abstraction surface)
- `parser.ts` — `Tag` interface, `detectTags()`, `detectIsolatedTag()`, `Element` interface, stack-based `Parser` class (parses expressions eagerly)
- `expression.ts` — `Expression` interface, tokenizer, `parse()` (attaches `text()` on root)
- `operator.ts` — `Operator` enum, `Literal` enum
- `normaliser.ts` — run normalization (aligns run boundaries to tag boundaries)
- `paragraph-reader.ts` — `ParagraphReader` inline classification
- `tree-reader.ts` — `TreeReader` recursive traversal
- `virtual-node.ts` — `VirtualNode` (typed `ContentNode` content)
- `hoist.ts` — boundary detection and hoisting
- `tag.ts` — re-exports from `parser.ts` (compatibility shim)
- `run.ts` — re-exports from `document.ts` (compatibility shim)

### Static analysis (`src/analysis/`)
- `analyse.ts` — `resolveHint()`, `analyse()` orchestrator
- `resolve.ts` — `Resolver` class, `TypedElement`, `FunctionRegistry`
- `reference-map.ts` — `ReferenceMap` (scoped variable bindings)

### DOM implementation (`src/dom/`)
- `node.ts`, `run.ts`, `paragraph.ts` — HTML element wrappers for docx-preview output

### OOXML implementation (`src/docx/`)
- `node.ts`, `run.ts`, `paragraph.ts` — XML element wrappers
- `document.ts` — `readDocx()` entry point

### Tests (`test/`)
- See `arch/test-overview.md` for full coverage analysis
- `test-run.ts` — test helper: concrete `Run` implementation
- `e2e-analysis.test.ts` — TreeReader → analyse pipeline tests
- `test/dom/`, `test/docx/` — implementation-specific tests

## Architecture

- See `arch/` for design documents
- `arch/codebase-overview.md` — full structural overview with type hierarchy
- `arch/analysis.md` — static analysis design (two-pass type hinting, ReferenceMap, element orchestration)
- `arch/test-overview.md` — test suite analysis and coverage gaps
