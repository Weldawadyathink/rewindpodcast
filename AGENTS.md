# AGENTS

## Workflow

- Run `pnpm run typecheck` after code changes and before wrapping up work.
- Treat TypeScript errors as blockers unless the user explicitly asks for partial or exploratory work.
- If type generation is relevant to the change, run `pnpm run cf-typegen` before `pnpm run typecheck`.

## Project Notes

- Package manager: `pnpm`
- Main runtime: Cloudflare Workers
- Web framework: Hono
