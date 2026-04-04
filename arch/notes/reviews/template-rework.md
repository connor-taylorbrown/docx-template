## Review: Template rework
Before actioning any of the below, open a branch and commit the existing work. Then make the fixes on a subsequent commit.

**File:** parser.ts
- `expressionText` is redundant: its caller already does the `isKeyword` check, so inlining those branches is safe and makes the parsing algorithm less opaque. **Existing tests will validate this without change.**

**File:** expression.ts
- Good call to store the unprocessed string, but we should make it a field rather than a method in this case.

**Folder:** test/docx
- We now have integration tests for template > analysis and dom > template, but none for docx > template. As this ticket includes end-to-end testing among its concerns, let's fix that gap here. Write an addendum to the test plan in features/template-rework.md and await my approval.