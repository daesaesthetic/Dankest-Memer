# Arcade Command

Arcade Command is a Discord community bot command center with economy, games, meme creation, leaderboards, moderation controls, and server settings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## UptimeRobot monitoring

The API exposes a dependency-free health check at `GET /api/healthz`. It returns
HTTP `200` with `{"status":"ok"}` and does not require the Discord token or a
database query, so UptimeRobot can use it to detect whether the API process is
reachable.

For a continuously running Discord bot:

1. Publish the **API Server** artifact as an **Always On / VM** deployment.
   Autoscale deployments can scale down when idle; an uptime ping is not a
   substitute for an always-on deployment.
2. Copy the published API URL from Replit. Do not use the workspace
   `.replit.dev` URL.
3. In UptimeRobot, create an **HTTP(s)** monitor:
   - URL: `<published-api-url>/api/healthz`
   - Method: `GET`
   - Expected status: `200`
   - Interval: 5 minutes or more
4. Confirm the monitor receives `{"status":"ok"}`.

UptimeRobot can alert you when the published API is unreachable, but Replit's
VM deployment is what keeps the Discord gateway process running continuously.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/arcade-command/src/App.tsx` — responsive command center UI and local demo interactions
- `artifacts/arcade-command/src/index.css` — product theme, typography, motion, and responsive styling
- `lib/api-spec/openapi.yaml` — API contract, including Discord connection status
- `artifacts/api-server/src/routes/discord.ts` — server-side Discord bot status lookup
- `attached_assets/Pasted-Create-a-Discord-bot-that-replicates-the-functionality-_1786001920240.txt` — original product brief

## Architecture decisions

- Keep the bot token server-side and expose only safe connection status fields to the browser.
- Use local demo state for economy, games, memes, settings, and moderation until Discord command execution is implemented.
- Keep the frontend responsive and route-based so each command center surface can grow independently.

## Product

Users can explore an economy dashboard, transfer credits between wallet and bank, buy shop items, play mini-games, create and save meme cards, inspect multiple leaderboards, log moderation actions, configure server settings, and search the command index. The connected Discord bot identity and server count are shown when the secure token is valid.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after OpenAPI changes before typechecking packages that consume generated schemas.
- Discord command execution, moderation mutations, and message access still require a gateway/permissions implementation; the current UI labels those surfaces as demo-safe.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
