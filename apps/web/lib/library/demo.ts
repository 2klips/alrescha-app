import { createLibrarySnapshot, type LibraryItem } from "@arr/core";

const REVIEW_AUTH_CONTENT = `---
name: review-auth
description: Review fixture authentication behavior against its requirement IDs.
---

# Review authentication

1. Read \`spec.md\` authentication requirements.
2. Inspect exported symbols under \`src/\`.
3. Match passing tests by requirement ID.
4. Report missing links as \`inferred\`; never invent execution evidence.
`;

export const DEMO_LIBRARY_ITEM: LibraryItem = {
  ...createLibrarySnapshot({
    content: REVIEW_AUTH_CONTENT,
    name: "Review auth",
    source: {
      commitSha: "1".repeat(40),
      path: ".agents/skills/review-auth/SKILL.md",
      repository: "arr/drifted-demo",
    },
    tags: ["auth", "review"],
    type: "skill",
  }),
  createdAt: "2026-08-14T09:00:00.000Z",
  id: "demo-review-auth",
};
