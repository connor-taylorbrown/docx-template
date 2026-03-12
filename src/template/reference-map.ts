import type { BaseType, TypeHint } from "./resolve.js";

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

    if (hint.strong && !existing.strong) {
      existing.strong = true;
      existing.type = hint.type;
    }
  }

  declare(name: string): ReferenceMap {
    const childScope = new Map(this.scope);
    childScope.set(name, { strong: false, type: { kind: "string" } });
    return new ReferenceMap(this.context, childScope);
  }
}
