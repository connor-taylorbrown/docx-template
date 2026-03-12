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
- `tag.ts` — `Tag` interface, `detectTags()` regex scanner
- `parser.ts` — `Element` interface, stack-based `Parser` class
- `inline.ts` — `ParagraphView` abstraction, `parseInline()` orchestrator
- `normaliser.ts` — run normalization (aligns run boundaries to tag boundaries)
- `run.ts` — abstract `Run` class (split/merge operations)
- `tree-reader.ts` — abstract `TreeNode`, `TreeReader` recursive traversal
- `document-node.ts` — `DocumentNode` base class
- `operator.ts` — `Operator` enum, `Literal` enum
- `expression.ts` — `Expression` interface, tokenizer, `parseExpression()`
- `resolve.ts` — `Resolver` class, `TypedElement`, `FunctionRegistry`
- `reference-map.ts` — `ReferenceMap` (scoped variable bindings)
- `analyse.ts` — `resolveHint()`, `analyse()` orchestrator

### DOM implementation (`src/dom/`)
- `node.ts`, `run.ts`, `paragraph.ts` — HTML element wrappers for docx-preview output

### OOXML implementation (`src/docx/`)
- `node.ts`, `run.ts`, `paragraph.ts` — XML element wrappers
- `document.ts` — `readDocx()` entry point

### Tests (`test/`)
- Mirror `src/template/` with `.test.ts` files
- `test-run.ts` — test helper: concrete `Run` implementation for testing
- `test/dom/`, `test/docx/` — implementation-specific tests

## Architecture

- See `arch/` for design documents
- `arch/codebase-overview.md` — full structural overview with type hierarchy
- `arch/renderer.md` — renderer and expression system design
- `arch/analysis.md` — static analysis design (two-pass type hinting, ReferenceMap, element orchestration)
