import type { Element } from "../src/template/parser.js";
import type { FunctionRegistry } from "../src/template/resolve.js";
import { Resolver } from "../src/template/resolve.js";
import { analyse, ReferenceMap } from "../src/template/analyse.js";

const emptyRegistry: FunctionRegistry = {
  lookup() { return null; },
};

export function resolve(elements: Element[]): ReferenceMap {
  const refs = ReferenceMap.create();
  const resolver = new Resolver(emptyRegistry);
  for (const el of elements) {
    analyse(el, refs, resolver);
  }
  return refs;
}
