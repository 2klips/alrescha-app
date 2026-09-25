import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { EVERY_ROW, readRowsByPosition } from "./table-pages";

describe("a table read by position", () => {
  it("refuses a read with no budget, which a range cannot end", () => {
    // Refused before any request is made, so no client is needed.
    const client = {} as SupabaseClient;
    expect(() =>
      readRowsByPosition(
        client,
        "file_co_changes",
        "path_a",
        EVERY_ROW,
        [["path_a", true]],
        (query) => query,
      ),
    ).toThrow(RangeError);
  });
});
