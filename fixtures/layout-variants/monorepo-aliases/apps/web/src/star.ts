import { slugify } from "@demo/core";

export function normalize(value: string): string {
  return slugify(value);
}
