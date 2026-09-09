import { labelFor } from "@/lib/api";
import { cardTitle } from "@/components";

export function page(name: string): string {
  return cardTitle(labelFor(name));
}
