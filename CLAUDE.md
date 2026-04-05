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

## Definition of done

- `npm test` passes
- `npm run lint` passes
- `arch/` docs updated if behaviour or structure changed
- Changes committed to a branch (not `main`)

## Planning

When asked to plan a feature, write a feature doc in `arch/features/`. Structure:

1. **Summary** — what and why, in a paragraph
2. **Justification** — why this matters; what breaks or degrades without it
3. **Changes** — concrete, enumerated modifications to the codebase
4. **Pseudocode** — key algorithms or logic sketched in TypeScript
5. **Test plan** — table of cases grouped by concern, with expectations

## Architecture

- `arch/codebase-overview.md` — structural overview with type hierarchy
- `arch/analysis.md` — static analysis design
- `arch/test-overview.md` — test suite analysis and coverage gaps
