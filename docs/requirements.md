# Rewind Podcast Requirements

## Vision

Rewind Podcast is a stateless Cloudflare Worker that re-publishes an existing podcast RSS feed on a new schedule so a listener can experience an old show as if it were releasing for the first time.

The same Worker should also serve an approachable website for non-technical users. The site will collect a source feed URL and replay options, then generate a custom feed URL that can be pasted into a podcast player.

## Product Goals

- Let a listener subscribe to a replayed version of any public podcast RSS feed.
- Support podcast feeds broadly, including Atom if real-world podcasts rely on it.
- Preserve the original episode order exactly.
- Rewrite only the minimum parts of the feed needed to support the replay experience.
- Keep the system stateless so a single Cloudflare Worker can serve all users.
- Prefer resilience and pass-through behavior over strict normalization.

## Core Behavior

### Feed input

- The Worker accepts a source feed URL.
- The Worker accepts replay configuration through URL query parameters.
- The generated feed URL should be stable and self-contained so no database or user account is required.

### Scheduling

- The replay should default to weekly release cadence.
- The replay should also support custom intervals.
- Supported scheduling fields currently expected:
  - replay start date
  - cadence count
  - cadence unit
  - release weekday
  - release time
  - time zone
- The public feed URL should not include a `startFromEpisode` parameter.
- The website may offer a "start from episode N" convenience input that computes an adjusted start date before generating the final URL.
- When using "start from episode N", the selected episode should be the newest episode available on the user-selected start date, while older episodes remain in the feed.

### Feed rewriting

- The Worker fetches the source feed.
- The Worker fetches the source feed on every request.
- The Worker rewrites episode release dates onto the replay schedule.
- The Worker removes or suppresses episodes whose replay release date is still in the future.
- The Worker leaves episode download and enclosure URLs pointing at the original host.
- The Worker adds a note near the top of each episode description indicating the original release date.
- The Worker should otherwise preserve the original feed as much as possible.

## Feed Handling Philosophy

- Prefer "modify in place" over parse-normalize-reencode.
- Pass through as much source markup, XML structure, namespaced tags, and formatting as possible.
- Be best-effort when the input feed contains unusual or imperfect RSS structures.
- Log warnings or parsing anomalies when the feed is weird, but still try to return a workable feed.
- If an episode does not have a usable publish date, fall back to feed order rather than failing the request.

## Technical Direction

- Runtime: Cloudflare Workers
- Framework: Hono
- State: none
- UI: simple built-in website served from the same Worker
- Storage: none unless a future requirement proves it is unavoidable

## Website Expectations

- Friendly to non-technical users.
- Form-based feed configuration.
- Explains each setting in plain language.
- Produces a custom feed URL ready to paste into a podcast app.
- Supports the website-only "start from episode N" helper flow.
- Includes an advanced option for channel title templating.
- Advanced users should be able to choose between a default replay-title template, the untouched original title, or a fully custom title.

## Open Questions

1. How should the original release note be injected when an episode description uses HTML, CDATA, plain text, or a namespaced field such as `content:encoded`?
2. Besides title templating, which channel-level metadata should be optionally customizable in v1: description, artwork, author, or self-link?
3. Should there be a maximum number of source episodes processed per request to keep Worker execution time predictable?
4. Do we want optional "pause" behavior, where a listener can temporarily stop receiving new replay episodes without changing the feed URL?
5. Should the UI validate podcast URLs aggressively, or mostly trust input and let the Worker explain failures?

## Decisions Confirmed

- Package manager: `pnpm`
- Feed format scope: support podcast feeds broadly; include Atom if podcasts in the wild need it
- Missing or inconsistent episode dates: fall back to feed order
- Channel title behavior: offer templating by default, with advanced options for original title or fully custom title
- Source fetching and feed generation: do the work fresh on every request

## Initial Milestones

1. Build a reliable query parameter contract and public URL format.
2. Implement source feed fetch plus minimal XML-aware rewrite strategy.
3. Implement schedule calculation and future-episode trimming.
4. Add description note injection while preserving original markup.
5. Add logging and user-facing error responses for malformed or unusual feeds.
6. Polish the website flow and documentation.
