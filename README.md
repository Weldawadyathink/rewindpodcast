# Rewind Podcast

Stateless podcast feed replay on Cloudflare Workers.

The goal is to take an existing podcast RSS feed, rewrite episode publish dates onto a new schedule, hide episodes whose replay date is still in the future, and preserve as much of the original feed as possible.

## Stack

- Cloudflare Workers
- Hono
- TypeScript

## What It Does

- Fetches a source podcast feed on every request
- Rewrites episode release dates onto a replay schedule
- Removes episodes whose replay date is still in the future
- Preserves original enclosure URLs
- Adds an “Originally released” note to episode content when possible
- Serves a simple website that generates replay feed URLs

See [docs/requirements.md](./docs/requirements.md) for the working spec and open product decisions.

## Main Routes

- `/` renders the feed builder website
- `/feed` returns the rewritten RSS or Atom feed
- `/healthz` returns a small JSON health response

## Local Development

```bash
pnpm install
pnpm run cf-typegen
pnpm run check
pnpm run dev
```
