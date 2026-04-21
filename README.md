# Rewind Podcast

Stateless podcast feed replay on Cloudflare Workers.

The goal is to take an existing podcast RSS feed, rewrite episode publish dates onto a new schedule, hide episodes whose replay date is still in the future, and preserve as much of the original feed as possible.

## Stack

- Cloudflare Workers
- Hono
- TypeScript

## Current Status

The repository is scaffolded with:

- a Hono Worker entrypoint
- a starter website for generating replay feed URLs
- an initial product requirements document

See [docs/requirements.md](./docs/requirements.md) for the working spec.

## Local Development

```bash
npm install
npm run cf-typegen
npm run check
npm run dev
```
