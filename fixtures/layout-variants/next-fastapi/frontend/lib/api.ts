import { formatUser } from "@/lib/format";

export function labelFor(name: string): string {
  return formatUser(name);
}
