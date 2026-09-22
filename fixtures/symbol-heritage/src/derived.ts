import type * as base from "./base";
import { Base, type Shape } from "./index";

export class Derived extends Base implements Shape {
  area(): number {
    return 1;
  }
}

export interface Circle extends Shape, base.Named {
  radius: number;
}

export class Local extends Derived {}

export class Twice extends Base {}

export function helper(): Derived {
  return new Derived();
}
