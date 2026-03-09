# Parser architecture
The following design supports logical template construction in a single pass over a *document tree.* This label is deliberately abstract: while rendering directly to XML is a critical use case, it is also important to render to DOM. We will be using `docx-preview` to support performant, interactive sessions with the template renderer.

## Main loop
All parsing is initiated from the recursive `classify` method on the `TreeReader` class. This accepts a parser instance as a constructor parameter, alongside an inline parser factory.

**Paragraph classification:** in-order document tree traversal to the paragraph level. For each paragraph:
   1. Handle isolated tag: if paragraph text lazy matches single tag, push node reference and result (tag) to parser.
   2. Handle other paragraph: perform inline parse, then push node reference and result (elements) to parser. **NOTE:** Result may be empty. Inline parse may modify paragraph tree (see "Run Normalisation" below).

## Parsing
The parser is designed for on-line operation, with methods to accept the following inputs:
- Tag node: isolated tag.
  - If keyword: opens or closes element scope.
  - Else add node and element to scope.
- Element collection node: other paragraph. Adds node and elements to scope.

Instance state tracks current scope using a stack. When scope is closed, pop the finished element, and add to scope.
- The parser is initialised with a root scope, such that an empty stack implies a syntax error: no open scope for closing tag.

### Inline parser
The inline parser extends the parser by composition. It exposes a completely different interface in correspondence with its distinct use case, but reuses parser functionality. To do this, some preprocessing is required.
1. **Tag detection:** perform text extraction, and identify text offset, length, head word and parameter list of each tag. Regex functionality is sufficient. Exit early with empty list if applicable.
2. **Run normalisation:** now we know the text offsets, iterate over runs. Split run at tag start, merge run if length out of bounds. Split run at tag end. **NOTE:** as a mutating operation, correctness is critical. See implementation notes below.
3. **Parsing:** push tag or element collection to parser. Notably, element collections in this context contain zero or one elements.
4. **Collection:** fetch result from parser. Note that this will be a single node with one or more children: return the children.

## Implementation notes
### Run normalisation
The function of run normalisation is to guarantee a one-to-one mapping between tags and nodes, and thereby ensure that no content external to the template element is modified at render time. However, it is a crucial simplifying assumption for the tree reader that paragraph references do not change. We can square these two goals in the following manner.

After the inline parser detects tags, it performs run normalisation. We treat the paragraph as a *run queue,* reading and removing the first node on each iteration. Each node has a *text length,* which we use to update a running text offset, and track the next tag.

The normaliser depends on two operations: split and merge. These are encapsulated in a `Run` class, whose implementation depends on the tree type (i.e. XML node vs. browser DOM). The run queue should be a collection of this type.

Tag detection should save all tag descriptors to a *tag queue,* such that the next tag is defined as the head of the queue. In relation to the current run, the next tag may:
- Open: before, on, or after.
- Close: on or after **only.**

Because `open` and `close` states are partially dependent, there are five possible combinations to handle:
1. Open after, close after: submit run unchanged, retain next tag.
2. Open on, close after: split run, retain next tag.
3. Open on, close on: split run twice, consume tag.
4. Open before, close after: merge with previous run, retain next tag.
5. Open before, close on: split and merge left with previous run, consume tag.

These descriptions surface a few requirements. When the current run opens but does not close a tag (case 2), it is necessary to store the right-hand side of the split, such that it can be merged on a future run (cases 4-5). Because there may be arbitrarily many runs (case 4) before the next split (case 5), this calls for a *merge queue.*

The simplest cases are thus 1 &amp; 4, which involve only queue updates, and no splits. Case 2 flows naturally into 4, involving one split, and two queue updates. The most complex are 3 &amp; 5, as these consume from the tag queue. Case 3 in particular may repeat arbitrarily. The following pseudocode illustrates the approach, hinging on the key condition of whether a tag closes on the current run.
```
-- Given run_queue from node
-- Given tag_queue from previous stage

run_offset := 0
merge_queue := Queue()
final_queue := Queue()
while run_queue:
   run := run_queue.dequeue()
   while tag_queue:
      tag := tag_queue.next()

      -- Close after: match rest of run without changing next tag
      if tag.offset + tag.length > run_offset + run.length:
         -- Open after: current run ends before next tag
         if tag.offset > run_offset + run.length:
            final_queue.enqueue((nil, run))

         else:
            -- Open on: current run contains pre-tag content to submit
            -- Not >= as empty LHS is wasteful
            if tag.offset > run_offset:
               head, run := run.split(tag.offset - run_offset)
               final_queue.enqueue((nil, head))
            
            -- No pre-tag content remaining: equivalent to open before
            merge_queue.enqueue(run)
         
         run_offset += run.length
         break

      -- Close on: split run after tag, then consume.
      end := tag.offset + tag.length - run_offset
      head, run := run.split(end)
      
      -- Open on, close on: head contains pre-tag content to submit
      if tag.offset > run_offset:
         left, head := head.split()
         final_queue.enqueue((nil, left))
      
      -- Tag owns LHS with merge queue, or LHS without pre-tag content
      -- Note that tag.offset = run_offset is treated as "open before"
      tag := tag_queue.dequeue()
      content := head.merge(merge_queue)
      final_queue.enqueue((tag, content))
      
      run_offset := end

return final_queue
```

The tuples contained in the final queue can now be used to mutate the original tree, and feed the parser.
```
-- Given node
-- Given factory

parser := factory.create()
while final_queue:
   tag, content := final_queue.dequeue()
   node.addChild(content)

   if not tag:
      parser.add(content, [])
   else:
      parser.add(content, [tag])

-- As parsing is an on-line algorithm, this simply pops the scope stack.
-- If the stack is not empty after this operation, throw a syntax error.
return parser.parse().children
```