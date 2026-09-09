import { formatUser } from "@/lib/format";

export function check(): boolean {
  return formatUser(" a ") === "a";
}
