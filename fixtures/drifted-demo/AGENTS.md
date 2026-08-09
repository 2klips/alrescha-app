# Fixture-only agent rules

This repository is deterministic test data for SpecProof. These rules apply only inside `fixtures/drifted-demo`.

- All API responses in this fixture MUST use snake_case JSON keys.
- Test names MUST include their requirement ID.
- Never add network access; fixture execution stays offline.

