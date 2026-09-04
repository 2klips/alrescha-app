import { greet } from "@demo/core";
import { slugify } from "@demo/core/util";

export function render(name: string): string {
  return slugify(greet(name));
}
