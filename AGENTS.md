# AGENTS

## Workflow

- Run `pnpm run typecheck` after code changes and before wrapping up work.
- Treat TypeScript errors as blockers unless the user explicitly asks for partial or exploratory work.
- `pnpm run typecheck` already runs `pnpm run cf-typegen` first, so prefer the single command unless you specifically need regenerated types by themselves.

## Project Notes

- Package manager: `pnpm`
- Main runtime: Cloudflare Workers
- Web framework: Hono
