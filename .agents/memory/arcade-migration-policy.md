---
name: Arcade migration policy
description: How to evolve the Arcade Command PostgreSQL schema safely after its initial push-based setup.
---

Use the committed Drizzle migration history for any shared or production Arcade schema change. Treat applied migrations as immutable; make corrections in a new forward-only migration.

**Why:** The project began without migration history and existing data may already have been created through schema push. Rewriting an applied migration makes environments diverge and can silently leave production schema behind the code.

**How to apply:** Add schema edits to Drizzle definitions, generate or author the next migration under the committed migration directory, review its data-safety behavior, and apply it with the migration command. Reserve schema push for disposable local development only.