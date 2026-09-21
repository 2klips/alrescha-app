export class Base {
  run(): string {
    return "base";
  }
}

export interface Shape {
  area(): number;
}

export interface Named {
  name: string;
}

class Hidden {}

/** A base that is not exported has no node, so this declares no `extends`. */
export class FromHidden extends Hidden {}

export function describe(shape: Shape): number {
  return shape.area();
}
