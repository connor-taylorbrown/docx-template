## Template and expression parsing
The template parser may encapsulate the entire parsing concern, producing elements with keyword and expression fields, rather than deferring those to a later `Tag` parser.

**Affected files:**
- This change would simplify the static analysis entrypoint `analyse.ts::analyse`, which currently orchestrates expression parsing.
- In its place, `parser.ts::addTag` will do more work when receiving a start tag. Instead of setting up a scope with a tag, it will set up a scope with a nullable `keyword` string, and a required `expression` field.
- To simplify testing in the first instance, `Expression` should define a `text` method, whose result should be identical to `params` on a keyword tag. Tests involving simple element parser output will need additional rework.

**File structure:**
- After this change, the role of `Tag` will be isolated to a communication protocol between the `Reader` (`TreeReader`, `ParagraphReader`) classes, and the template parser. While this parser will delegate to `expression.ts::parse`, that function already maps from a string to an `Expression` tree.
- This isolation parallels `TagResult`, which is used by the `Reader` classes to construct a `VirtualNode` containing a nullable `Element`. **Move the contents of `tag.ts` to `parser.ts` to make explicit its role as a communication contract.**
- The complete parser orchestration concern is encapsulated by the `TreeReader` class, which maps `TreeNode` to `VirtualNode`, or directly to `Element` by way of the `result` method. In either case, `TreeReader` is the only public access point for parsing, so the requirements of `VirtualNode > Element` dictate what consumers need to reference.
- **The `template/` folder should be occupied solely by `TreeReader`, along with its direct and transitive dependencies after this change.** Static analysis and rendering are non-overlapping concerns, that depend on distinct outputs of `TreeReader`. For each concern, its files should be itemised and moved to `analysis/` and `rendering/` respectively.