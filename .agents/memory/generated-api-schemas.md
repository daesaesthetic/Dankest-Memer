---
name: Generated API schemas
description: Compatibility note for OpenAPI code generation in this workspace.
---

When adding numeric fields to `lib/api-spec/openapi.yaml`, prefer `type: number` unless the generated Zod output has been checked against the installed Zod version.

**Why:** The current Orval/Zod 3 combination emitted `zod.int()` for an OpenAPI integer schema, but Zod 3 does not expose that helper, causing the required library typecheck to fail after codegen.

**How to apply:** After every OpenAPI change, run the api-spec codegen command and the library typecheck before using the generated client or server schemas.