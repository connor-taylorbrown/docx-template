# Agent pre-flight checks

Before starting any implementation work, run the following commands and confirm
they succeed. Do not proceed if any fail — report the failure instead.

1. `npm test` — all tests pass
2. `npm run lint` — no lint errors
3. Verify the branch is clean (`git status`)

These checks catch environment issues (missing dependencies, broken baseline)
before effort is wasted on implementation.
