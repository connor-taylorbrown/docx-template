import type { BaseType, TypeHint } from "./resolve.js";

export function assertCompatible(a: BaseType, b: BaseType): void {
  if (a.kind !== b.kind) {
    throw new Error(`Type conflict: ${a.kind} is not compatible with ${b.kind}`);
  }
}

function mergeInto(target: BaseType, source: BaseType): void {
  if (target.kind !== source.kind) return;

  switch (target.kind) {
    case "structure": {
      const src = source as typeof target;
      for (const [key, hint] of src.properties) {
        const existing = target.properties.get(key);
        if (existing) {
          mergeInto(existing.type, hint.type);
        } else {
          target.properties.set(key, hint);
        }
      }
      break;
    }
    case "collection": {
      const src = source as typeof target;
      if (src.item) {
        if (target.item) {
          mergeInto(target.item.type, src.item.type);
        } else {
          target.item = src.item;
        }
      }
      break;
    }
    case "number": {
      const src = source as typeof target;
      if (src.integer) {
        target.integer = true;
      }
      break;
    }
  }
}

export interface TypeBinding {
  strong: boolean;
  type: BaseType;
}

export class ReferenceMap {
  constructor(
    private context: Map<string, TypeBinding>,
    private scope: Map<string, TypeBinding>,
  ) {}

  static create(): ReferenceMap {
    return new ReferenceMap(new Map(), new Map());
  }

  get(name: string): TypeBinding | undefined {
    return this.scope.get(name) ?? this.context.get(name);
  }

  bind(name: string, hint: TypeHint): void {
    const target = this.scope.has(name) ? this.scope : this.context;
    const existing = target.get(name);

    if (!existing) {
      target.set(name, { strong: hint.strong, type: hint.type });
      return;
    }

    if (hint.strong && existing.strong) {
      assertCompatible(hint.type, existing.type);
      mergeInto(existing.type, hint.type);
      return;
    }

    if (hint.strong && !existing.strong) {
      existing.strong = true;
      existing.type = hint.type;
      return;
    }

    if (!hint.strong && !existing.strong) {
      mergeInto(existing.type, hint.type);
    }
  }

  entries(): IterableIterator<[string, TypeBinding]> {
    return this.context.entries();
  }

  declare(name: string): ReferenceMap {
    const childScope = new Map(this.scope);
    childScope.set(name, { strong: false, type: { kind: "string" } });
    return new ReferenceMap(this.context, childScope);
  }
}
