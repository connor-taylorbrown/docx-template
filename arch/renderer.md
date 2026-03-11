# Designing a renderer
The rendering stage has as its input a *template tree,* which contains references to the underlying *document tree.* There are two key implementations of the document tree that we are concerned with:
- HTML DOM: read template structure from `docx-preview` output in-browser, to support interactive rendering.
- OOXML DOM: read template structure from XML parse tree, to create new document.

The most demanding of these use cases is interactive rendering, and as such we will design for this case.

## Background
The template tree is a recursive data structure of type `Element`:
```ts
interface Element {
  tag: Tag;
  nodes: [DocumentNode] | [DocumentNode, DocumentNode];
  children: Element[];
}
```

Structurally, we can distinguish two types of element:
- Simple elements: a single `DocumentNode`, no children.
- Block elements: two bounding `DocumentNode` references, arbitrary children.

While rendering a simple element is trivial, it illustrates our requirements in their most basic form. Simple elements reference variables, whose values we expect to see reflected in the document. As such, when a value changes, something must happen to `node[0]`. Two options:
- Update in place: simple, immediately reflected in the document tree.
- Clone and update: make a copy and update that. Copy must be swapped into the document tree, adding to both memory usage and tracking complexity.

While there is little reason to use the clone and update option for simple elements, block elements control a whole span of nodes, which may be deleted or copied any number of times. Elements may also nest in block elements, for example a simple element inside an `#if` statement. When the condition is disabled, the span is deleted. When it is enabled, the span is cloned, and the simple element is rendered.

The `#if` example implies a separate cloning source, external to the document, for writing back a deleted span. This source is the *prototype instance,* and it consists of nodes from the initial state of the document tree. While a complete listing of these nodes is not given in parser output, we can construct it from the nodes' parent reference.

### The sibling assumption
The parser is quite opinionated about *inline elements:* if a block element is entirely contained in a single paragraph, its boundary nodes are sibling runs. It is less opinionated about multi-line elements, whose boundary nodes are merely two paragraphs in the correct order. Rather than complicate the parsing algorithm with checks for all kinds of paragraph contexts, we defer enforcement of the sibling assumption to the renderer, which may then exploit it to its benefit when defining and splicing element spans.

Under the sibling assumption, a block element controls a span of nodes, uniquely identified by parent reference, offset, and length. If the boundary nodes do not share a parent reference, a *broken element* and a rendering error are the result. Otherwise, the offset and length can be identified with a two-pointer scan of the parent's children (O(n)).

If the boundary nodes are siblings, then the nodes of any nested element are also descendants of the parent: either the nested element controls a subspan, or some member of the span is the ancestor of its boundary nodes. Any splicing operation will reinstantiate or delete these nodes.

Implicitly, sibling *elements* do not necessarily share node parents. But if they do, then a splicing operation will affect the offset of all siblings to the right. Identifying which siblings is therefore necessary for good bookkeeping: after a splicing operation, update document sibling offsets.

## Formulating the model
Each template element is a static reference to some variables, with a fixed parent, offset, and length. Rendering instantiates these elements, first from the template root, and subsequently in response to value change.

**Events:**
- `update()`: render from root, e.g. on first render.
- `update(variable, value)`: render from reference set, e.g. when value changes.

The *render tree* is a more complex data structure than the template tree, as it must track an instance list for each element, splice nodes into the document, and update offsets. We use the *decorator pattern* to initialise a render tree from an existing template tree.
```ts
class RenderElement {
    constructor(element: Element) {
        this.element = element;
        this.instances = [];
        ...
    }

    render(): void {
        ...
    }
}
```

### Structural rendering
Rendering proceeds in stages. The first stage, *structural rendering,* builds out the instance graph. Each element has its own instantiation behaviour, determined by its tag. 

**Behaviours:**
For reference, `Tag` consists of the following fields:
```ts
interface Tag {
    /* Used for run normalisation */
    offset: number;
    length: number;
    
    /* Semantic values used by renderer */
    head: string;
    params: string | null;
    isKeyword: boolean;
}
```

- Simple elements (`!isKeyword`) join `head` and `params`:
  - `expression`: append one instance with the result of `expression`.
- Keyword behaviours treat `head` and `params` separately:
  - `#if condition`: if `condition` evaluates to `true`, append one instance.
  - `#each item in collection`: append an instance for each item in `collection`.
- Any unsupported behaviour results in a rendering error.

The `RenderInstance` type may then be defined as follows:
```ts
interface RenderInstance {
    item: unknown;
    children: RenderElement[];
}
```

Item is null for `#if` behaviour. For other cases, its proper type depends on its usage in nested elements. Structural rendering then continues with a depth-first traversal of `children`, carrying the value of `item`.

#### Problems
The method described is perfectly adequate for creating a document in a single pass, given a map of variable names to values, in which type checking can be deferred until time of use. For the interactive use case, however, this is a poor user experience. The template already contains the complete list of required variables, and sufficient information to identify their types and structures. Non-technical users would benefit particularly from input validation (reliant on static type knowledge) over potentially confusing rendering errors. As such, we perform static analysis before any rendering, and pre-validate all values.

### Static analysis
We will begin with an overview of the expectations for the type system to enforce:
- `#each item in collection`: references a member of a *collection.*
- `#if condition`: evaluates to a value with a boolean interpretation.
- `expression`: evaluates to a value with a string interpretation.

All values have string and boolean interpretations available, so these usages specify only *default types.*

It is inconvenient not to allow complex conditions and expressions for inline calculation. These environments introduce support for *logical* and *arithmetic operators,* as well as function references for more complex behaviour. While the `collection` environment may also support expression syntax, type expectations are stricter, such that certain operations may not be supported. As a variable declaration environment, collection member reference only supports labels.

**Operations:** In most cases, the operator enforces a particular type for all (one or two) arguments. Where it returns a variable type (e.g. `+`/`*`), the actual type is given by context. This is either the expression environment, or previous use of the variable. Strict equality and its negation enforce no input types whatsoever.
  - **Unary:**
    - `-a`: `number => number`.
    - `not a`: `T => boolean`
  - **Binary** (listed by precedence, tightest-binding first):
    - `a.b`: `T, V => V`
    - `a * b`: `number, T => T, given T not boolean`
    - `a / b`: `number, number => number`
    - `a + b`: `T, T => T, given T not boolean`
    - `a - b`: `number, number => number`
    - `a < b`: `number, number => boolean`
    - `a <= b`: `number, number => boolean`
    - `a > b`: `number, number => boolean`
    - `a >= b`: `number, number => boolean`
    - `a = b`: `T, V => boolean`
    - `a != b`: `T, V => boolean`
    - `a and b`: `T, V => boolean`
    - `a or b`: `T, V => boolean`
    - `a in b`: `T, collection => boolean`

> **Note:** `in` serves dual roles. As a binary operator (membership test), it shares comparison-level precedence. In `#each item in collection`, however, it acts as a scope separator where the entire right-hand side is the collection expression. The expression parser treats `in` at comparison precedence; the `#each` form requires special handling at a later stage.

We are dealing with a rather complex type system here. Of the tags, only `#each item in collection` makes a strong typing claim, to say nothing about the type of `item`. Various operators also make strong typing claims, while two enforce *generic typing.* For example, `a * b` does not uniquely define the type of `b`, but it is known to be exactly the type of `a * b`. If this is a collection, then so is `b`. If it is a condition, then we might weakly specify it as boolean, but this contradicts the strong specification (i.e. not boolean). We might also prefer a numeric interpretation for both operands.

Consider the following examples:
1. Given `#each item in a * b`, we start with a strong type hint for the expression `a * b`. The operator receives this type hint, and lists `a` as a number, and `b` as a collection.
2. Given `#if a * b`, we start with a weak type hint for the expression `a * b`. The operator receives this type hint, and lists `a` as a number, but cannot list `b` as a boolean. It provides a weak type hint of number instead.
3. Given `#if a = b`, we start with a weak type hint for the expression `a = b`. The operator ignores this type hint, and lists `a` and `b` with no type information.

Variables may be referenced multiple times in a template. Type strengthening is possible, but type weakening is an error. In example (1), a listing for `b` may already exist. If this listing has a different strong type hint, static analysis terminates with a type error. In example (2), `b` may be subsequently strongly typed as a number, by an expression like `a / b`.

#### Expression parsing
The content of the expression depends on the tag:
- The full content of a simple element, and the parameters of an `#if` element, are free expressions.
- `#each item in expression`: the `#each` statement must contain an `in` expression, for which the left-hand side is a scoped variable declaration. The usual type of this expression is ignored here.

Expressions are recursively defined. They contain either:
- A unary operator followed by an expression,
- An expression, a binary operator, and another expression,
- A parenthesised expression, or
- A function invocation.

A function invocation is a space-separated list of expressions. While this makes zero-argument functions syntactically indistinguishable from plain references, the source of the value makes no difference to the accuracy of the type system. Furthermore, user-defined functions are not allowed, and as such must be pre-loaded in context. Function definitions may provide strong or generic type hints for all expressions used as parameters.

We may parse an expression as an operator-separated string. This requires the use of a regex to find the next occurrence of single character, symbol string, and word operators. Support leading and trailing whitespace, and allow optional content to enable function invocation syntax. After trimming, the empty string is a recognised operator.

We may use the *shunting yard algorithm* to iteratively build a syntax tree. Given the special function invocation operator, every string containing multiple references or literals is an infix string. This provides safety to the implementation, as the shunting yard algorithm alone cannot enforce the infix property. Unary operators may be detected by keeping track of the last token: if this was an operator, then push to the operator stack with a unary flag set.
- We pop from the operator stack before pushing a lower-precedence operator as usual.
- When popping from the operator stack, pop the required number of values (two, or one if flagged) from the output stack, then push a new expression to the output stack.
- The output stack is of type `Expression[]`. References and literals should be wrapped in this type, with no operator.
