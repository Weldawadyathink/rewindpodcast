import { Hono, type Context } from 'hono';
import QRCode from 'qrcode';
import {
	buildReplayFeed,
	decodeReplayFeedConfig,
	encodeReplayFeedConfig,
	parseReplayFeedConfig,
	type CadenceUnit,
	type ReplayFeedConfigParams,
} from './feed';
import { PODCAST_APPS } from './podcast-apps';

type FeedFormState = {
	sourceUrl: string;
	startDate: string;
	episodeNumber: string;
	cadenceCount: string;
	cadenceUnit: CadenceUnit;
	releaseWeekday: string;
	releaseTime: string;
	timeZone: string;
	titleTemplate: string;
	descriptionTemplate: string;
};

const defaultState: FeedFormState = {
	sourceUrl: '',
	startDate: '',
	episodeNumber: '',
	cadenceCount: '1',
	cadenceUnit: 'weeks',
	releaseWeekday: 'monday',
	releaseTime: '09:00',
	timeZone: 'America/Los_Angeles',
	titleTemplate: '{{title}} (Rewind)',
	descriptionTemplate: 'RewindPodcast.com feed for {{title}}. Episodes release every {{cadenceCount}} {{cadenceUnit}}.\n\n{{description}}',
};

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
	return c.html(renderHomePage(buildFeedFormState(fromLegacyQuery(c.req.query())), c.req.url, hasExplicitWeekday(c.req.query())));
});

app.get('/r/:encoded/edit', (c) => {
	try {
		const encoded = c.req.param('encoded');
		if (!encoded) {
			throw new Error('Invalid rewind feed URL.');
		}
		const params = decodeReplayFeedConfig(encoded);
		return c.html(renderHomePage(buildFeedFormState(params), c.req.url, hasExplicitWeekday(params)));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid replay settings.';
		return c.html(renderListenErrorPage(c.req.url, message), 400);
	}
});

app.get('/healthz', (c) =>
	c.json({
		ok: true,
		service: 'rewindpodcast',
		timestamp: new Date().toISOString(),
	}),
);

app.get('/listen', async (c) => {
	const query = c.req.query();
	if (query.source) {
		return c.redirect(buildListenUrl(new URL(c.req.url), fromLegacyQuery(query)), 302);
	}

	try {
		throw new Error('Invalid rewind feed URL.');
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid replay settings.';
		return c.html(renderListenErrorPage(c.req.url, message), 400);
	}
});

app.get('/r/:encoded/listen', async (c) => {
	try {
		const encoded = c.req.param('encoded');
		if (!encoded) {
			throw new Error('Invalid rewind feed URL.');
		}
		const params = decodeReplayFeedConfig(encoded);
		const config = parseReplayFeedConfig(params);
		const feedUrl = buildFeedUrl(new URL(c.req.url), encoded);
		const qrCodeSvg = await buildQrCodeSvg(c.req.url);
		return c.html(renderListenPage(c.req.url, config, feedUrl, qrCodeSvg, encoded));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid replay settings.';
		return c.html(renderListenErrorPage(c.req.url, message), 400);
	}
});

app.get('/feed', async (c) => {
	if (c.req.query().source) {
		return handleLegacyFeedRequest(c, false);
	}

	return c.text('Missing feed configuration.', 400);
});

app.on('HEAD', '/feed', async (c) => {
	if (c.req.query().source) {
		return handleLegacyFeedRequest(c, true);
	}

	return new Response(null, { status: 400 });
});

app.get('/feed.xml', async (c) => {
	if (c.req.query().source) {
		return handleLegacyFeedRequest(c, false);
	}

	return c.text('Missing feed configuration.', 400);
});

app.on('HEAD', '/feed.xml', async (c) => {
	if (c.req.query().source) {
		return handleLegacyFeedRequest(c, true);
	}

	return new Response(null, { status: 400 });
});

app.get('/r/:encoded/feed.xml', async (c) => {
	return handleFeedRequest(c, false);
});

app.on('HEAD', '/r/:encoded/feed.xml', async (c) => {
	return handleFeedRequest(c, true);
});

export default app;

async function handleFeedRequest(
	c: Context<{ Bindings: Env }>,
	headOnly: boolean,
) {
	try {
		const encoded = c.req.param('encoded');
		if (!encoded) {
			throw new Error('Invalid rewind feed URL.');
		}
		const params = decodeReplayFeedConfig(encoded);
		const config = parseReplayFeedConfig(params);
		const result = await buildReplayFeed(config, {
			feedUrl: buildFeedUrl(new URL(c.req.url), encoded),
		});

		for (const diagnostic of result.diagnostics) {
			console.warn(
				JSON.stringify({
					diagnostic,
					kind: result.kind,
					scope: 'rewindpodcast',
				}),
			);
		}

		const contentLength = new TextEncoder().encode(result.xml).byteLength.toString();
		const lastModified = result.lastModified ?? new Date().toUTCString();
		const etag = await createWeakEtag(result.xml);

		const headers = new Headers({
			'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=300',
			'content-length': contentLength,
			'content-type': result.contentType,
			etag,
			'last-modified': lastModified,
			vary: 'accept-encoding',
			'x-content-type-options': 'nosniff',
		});

		if (c.req.header('if-none-match') === etag) {
			return new Response(null, {
				status: 304,
				headers,
			});
		}

		if (headOnly) {
			return new Response(null, {
				headers,
			});
		}

		return new Response(result.xml, { headers });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown feed generation error.';
		console.error(
			JSON.stringify({
				error: message,
				scope: 'rewindpodcast',
			}),
		);
		return c.text(message, 400);
	}
}

async function handleLegacyFeedRequest(
	c: Context<{ Bindings: Env }>,
	headOnly: boolean,
) {
	const params = fromLegacyQuery(c.req.query());
	const encoded = encodeReplayFeedConfig(params);
	const canonicalUrl = buildFeedUrl(new URL(c.req.url), encoded);
	const headers = new Headers({ location: canonicalUrl });

	if (headOnly) {
		return new Response(null, {
			status: 302,
			headers,
		});
	}

	return c.redirect(canonicalUrl, 302);
}

function renderHomePage(state: FeedFormState, requestUrl: string, hasExplicitWeekday: boolean): string {
	const request = new URL(requestUrl);
	const escapedState = JSON.stringify(state).replace(/</g, '\\u003c');
	const exampleUrl = buildListenUrl(request, {
		source: 'https://feeds.relay.fm/rd.xml',
		startDate: '2026-05-04',
		cadenceCount: '1',
		cadenceUnit: 'weeks',
		releaseWeekday: 'monday',
		releaseTime: '09:00',
		timeZone: 'America/Los_Angeles',
	});

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Rewind Podcast</title>
		<style>
			:root {
				color-scheme: light;
				--bg: #fbf6ee;
				--panel: rgba(255, 252, 247, 0.88);
				--panel-strong: #fffdf8;
				--text: #1f1a15;
				--muted: #6c5d4f;
				--line: rgba(68, 51, 33, 0.16);
				--accent: #bb4d00;
				--accent-soft: #ffe3cc;
				--shadow: 0 24px 60px rgba(87, 51, 20, 0.14);
				--radius: 22px;
			}

			* {
				box-sizing: border-box;
			}

			body {
				margin: 0;
				font-family: "Avenir Next", "Segoe UI", sans-serif;
				color: var(--text);
				background:
					radial-gradient(circle at top left, rgba(255, 214, 170, 0.9), transparent 34%),
					radial-gradient(circle at right center, rgba(253, 190, 138, 0.5), transparent 28%),
					linear-gradient(180deg, #fff9f2 0%, var(--bg) 55%, #f6efe3 100%);
				min-height: 100vh;
			}

			main {
				width: min(1080px, calc(100vw - 32px));
				margin: 0 auto;
				padding: 40px 0 56px;
			}

			.hero,
			.panel {
				background: var(--panel);
				backdrop-filter: blur(18px);
				border: 1px solid var(--line);
				border-radius: var(--radius);
				box-shadow: var(--shadow);
			}

			.hero {
				padding: 28px;
				margin-bottom: 24px;
			}

			.eyebrow {
				display: inline-block;
				margin-bottom: 14px;
				padding: 8px 12px;
				font-size: 12px;
				font-weight: 700;
				letter-spacing: 0.12em;
				text-transform: uppercase;
				border-radius: 999px;
				background: var(--accent-soft);
				color: var(--accent);
			}

			h1 {
				margin: 0 0 12px;
				font-size: clamp(2rem, 4vw, 4.4rem);
				line-height: 0.94;
				letter-spacing: -0.06em;
			}

			.hero p,
			h2,
			.panel p,
			label span,
			.help,
			.output-note,
			li {
				color: var(--muted);
				line-height: 1.55;
			}

			.layout {
				display: grid;
				grid-template-columns: 1.25fr 0.95fr;
				gap: 24px;
			}

			.panel {
				padding: 24px;
			}

			form {
				display: grid;
				gap: 16px;
			}

			.field-grid {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 16px;
			}

			label {
				display: grid;
				gap: 8px;
				font-weight: 600;
			}

			input,
			select,
			textarea,
			button {
				font: inherit;
			}

			input,
			select {
				width: 100%;
				padding: 12px 14px;
				border-radius: 14px;
				border: 1px solid rgba(76, 60, 41, 0.16);
				background: var(--panel-strong);
				color: var(--text);
			}

			input:focus,
			select:focus,
			button:focus {
				outline: 3px solid rgba(187, 77, 0, 0.16);
				outline-offset: 2px;
			}

			button {
				border: 0;
				border-radius: 14px;
				padding: 14px 18px;
				font-weight: 700;
				cursor: pointer;
				color: white;
				background: linear-gradient(135deg, #bb4d00 0%, #dd7021 100%);
				box-shadow: 0 16px 30px rgba(187, 77, 0, 0.24);
			}

			pre {
				margin: 12px 0 0;
				padding: 16px;
				border-radius: 16px;
				background: #201811;
				color: #f8eadd;
				font-family: "SFMono-Regular", "Menlo", monospace;
				font-size: 13px;
				line-height: 1.45;
				white-space: pre-wrap;
				word-break: break-all;
			}

			code {
				font-family: "SFMono-Regular", "Menlo", monospace;
			}

			ul {
				padding-left: 18px;
			}

			details {
				padding: 16px 18px;
				border-radius: 16px;
				border: 1px solid rgba(76, 60, 41, 0.12);
				background: rgba(255, 255, 255, 0.42);
			}

			summary {
				cursor: pointer;
				font-weight: 700;
			}

			textarea {
				width: 100%;
				min-height: 100px;
				padding: 12px 14px;
				border-radius: 14px;
				border: 1px solid rgba(76, 60, 41, 0.16);
				background: var(--panel-strong);
				color: var(--text);
				resize: vertical;
			}

			.result-card {
				display: grid;
				gap: 14px;
				padding: 18px;
				border-radius: 18px;
				background: rgba(255, 255, 255, 0.48);
				border: 1px solid rgba(76, 60, 41, 0.12);
			}

			@media (max-width: 860px) {
				.layout,
				.field-grid {
					grid-template-columns: 1fr;
				}

				main {
					width: min(100vw - 20px, 720px);
					padding-top: 20px;
				}

				.hero,
				.panel {
					padding: 20px;
				}
			}
		</style>
	</head>
	<body>
		<main>
			<section class="hero">
				<div class="eyebrow">Stateless Podcast Feed Rewrites</div>
				<h1>Make an old show feel freshly released again.</h1>
					<p>
						Paste an existing podcast RSS feed, choose when your replay should begin, and generate a custom URL for your podcast app.
						The Worker rewrites publish dates, hides episodes that have not "released" yet, and preserves the original episode media files.
				</p>
			</section>

			<div class="layout">
				<section class="panel">
					<form id="generator-form">
						<label>
							<span>Podcast RSS feed URL</span>
							<input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://example.com/feed.xml" required />
						</label>

						<div class="field-grid">
							<label>
								<span>Replay start date</span>
								<input id="startDate" name="startDate" type="date" required />
							</label>

							<label>
								<span>Release time</span>
								<input id="releaseTime" name="releaseTime" type="time" value="09:00" required />
							</label>
						</div>

						<div class="field-grid">
							<label>
								<span>Release every</span>
								<input id="cadenceCount" name="cadenceCount" type="number" min="1" step="1" value="1" required />
							</label>

							<label>
								<span>Cadence unit</span>
								<select id="cadenceUnit" name="cadenceUnit">
									<option value="weeks" selected>Weeks</option>
									<option value="days">Days</option>
								</select>
							</label>
						</div>

						<p class="help">
							Release weekday defaults to the weekday of your chosen start date. You only need the advanced options if you want to override that or tweak feed metadata.
						</p>

						<details>
							<summary>Advanced options</summary>
							<div class="field-grid" style="margin-top: 16px;">
								<label>
									<span>Release weekday</span>
									<select id="releaseWeekday" name="releaseWeekday">
										<option value="monday" selected>Monday</option>
										<option value="tuesday">Tuesday</option>
										<option value="wednesday">Wednesday</option>
										<option value="thursday">Thursday</option>
										<option value="friday">Friday</option>
										<option value="saturday">Saturday</option>
										<option value="sunday">Sunday</option>
									</select>
								</label>

								<label>
									<span>Time zone</span>
									<input id="timeZone" name="timeZone" type="text" value="America/Los_Angeles" required />
								</label>
							</div>

							<label style="margin-top: 16px;">
								<span>First episode number to treat as newest on that date</span>
								<input id="episodeNumber" name="episodeNumber" type="number" min="1" step="1" placeholder="Optional" />
							</label>

							<label style="margin-top: 16px;">
								<span>Feed title template</span>
								<input
									id="titleTemplate"
									name="titleTemplate"
									type="text"
									placeholder="{{title}} (Rewind)"
								/>
							</label>

							<label style="margin-top: 16px;">
								<span>Feed description template</span>
								<textarea
									id="descriptionTemplate"
									name="descriptionTemplate"
									placeholder="Template for the feed description."
								></textarea>
							</label>

							<p class="help">
								Supported template placeholders include <code>{{title}}</code>, <code>{{description}}</code>, <code>{{cadenceCount}}</code>, <code>{{cadenceUnit}}</code>, <code>{{startDate}}</code>, and <code>{{timeZone}}</code>.
							</p>
						</details>

						<button type="submit">Generate Podcast URL</button>
					</form>
				</section>

				<section class="panel">
					<h2>What this feed will do</h2>
					<ul>
						<li>Keep episode order the same as the source feed.</li>
						<li>Rewrite publish dates onto your chosen schedule.</li>
						<li>Exclude episodes whose rewritten release date is still in the future.</li>
						<li>Keep the original audio enclosure URLs untouched.</li>
						<li>Add a note with the original release date near the top of the description.</li>
						<li>Pass through as much of the original feed markup as possible.</li>
					</ul>

					<div class="result-card">
						<p class="output-note">After you click generate</p>
						<p style="margin: 0;">You’ll land on a page with your feed URL, a copy button, and app links like Apple Podcasts, Overcast, Pocket Casts, Castro, Downcast, and Android-compatible apps.</p>
						<pre id="output">${escapeHtml(exampleUrl)}</pre>
					</div>
				</section>
			</div>

			<section class="panel" style="margin-top: 24px;">
				<h2 style="margin-top: 0;">Open an existing rewind feed</h2>
				<p>
					Paste a Rewind Podcast feed URL to inspect it and edit its settings. This works with the new path-based feed URLs and older query-parameter feed URLs.
				</p>
				<form id="import-form" style="margin-top: 14px;">
					<label>
						<span>Existing rewind feed URL</span>
						<input
							id="existingFeedUrl"
							name="existingFeedUrl"
							type="url"
							placeholder="https://rewindpodcast.xyz/r/.../feed.xml"
							required
						/>
					</label>
					<button type="submit">Open Feed Settings</button>
					<div id="import-status" class="output-note" style="min-height: 1.4em;"></div>
				</form>
			</section>
		</main>
		<script>
			const initialState = ${escapedState};
			const hasExplicitWeekday = ${JSON.stringify(hasExplicitWeekday)};
			const form = document.getElementById('generator-form');
			const importForm = document.getElementById('import-form');
			const importStatus = document.getElementById('import-status');
			const output = document.getElementById('output');
			const startDateField = document.getElementById('startDate');
			const releaseWeekdayField = document.getElementById('releaseWeekday');
			const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
			let weekdayManuallyChanged = hasExplicitWeekday;

			for (const [key, value] of Object.entries(initialState)) {
				const field = document.getElementById(key);
				if (field && value) field.value = value;
			}

			if (releaseWeekdayField) {
				releaseWeekdayField.addEventListener('change', () => {
					weekdayManuallyChanged = true;
				});
			}

			if (startDateField) {
				startDateField.addEventListener('change', () => {
					syncWeekdayFromStartDate();
				});
			}

			syncWeekdayFromStartDate();

			form.addEventListener('submit', (event) => {
				event.preventDefault();

				const sourceUrl = document.getElementById('sourceUrl').value.trim();
				const startDate = document.getElementById('startDate').value;
				const episodeNumber = Number.parseInt(document.getElementById('episodeNumber').value, 10);
				const cadenceCount = Number.parseInt(document.getElementById('cadenceCount').value, 10);
				const cadenceUnit = document.getElementById('cadenceUnit').value;
				const releaseWeekday = document.getElementById('releaseWeekday').value;
				const releaseTime = document.getElementById('releaseTime').value;
				const timeZone = document.getElementById('timeZone').value.trim();
				const titleTemplate = document.getElementById('titleTemplate').value.trim();
				const descriptionTemplate = document.getElementById('descriptionTemplate').value.trim();

				if (!sourceUrl || !startDate || !cadenceCount || !releaseTime || !timeZone) {
					output.textContent = 'Please complete the required fields first.';
					return;
				}

				const adjustedStartDate = calculateStartDate(startDate, releaseWeekday, cadenceCount, cadenceUnit, episodeNumber);
				const encoded = encodeConfigSegment({
					source: sourceUrl,
					startDate: adjustedStartDate,
					cadenceCount: String(cadenceCount),
					cadenceUnit,
					releaseWeekday,
					releaseTime,
					timeZone,
					titleTemplate,
					descriptionTemplate,
				});
				const url = new URL('/r/' + encoded + '/listen', window.location.origin);

				output.textContent = url.toString();
				window.location.assign(url.toString());
			});

			importForm.addEventListener('submit', (event) => {
				event.preventDefault();

				const field = document.getElementById('existingFeedUrl');
				const rawValue = field.value.trim();
				if (!rawValue) {
					importStatus.textContent = 'Paste a rewind feed URL first.';
					return;
				}

				try {
					const rewindUrl = new URL(rawValue);
					const encoded = extractEncodedConfig(rewindUrl);
					if (!encoded) {
						importStatus.textContent = 'That URL does not look like a rewind feed.';
						return;
					}

					const editUrl = new URL('/r/' + encoded + '/edit', window.location.origin);
					window.location.assign(editUrl.toString());
				} catch (error) {
					importStatus.textContent = 'Paste a valid URL to continue.';
				}
			});

			function calculateStartDate(startDate, releaseWeekday, cadenceCount, cadenceUnit, episodeNumber) {
				const base = new Date(startDate + 'T00:00:00');
				const targetWeekdayIndex = weekdayNames.indexOf(releaseWeekday);

				if (targetWeekdayIndex >= 0 && cadenceUnit === 'weeks') {
					const delta = (targetWeekdayIndex - base.getDay() + 7) % 7;
					base.setDate(base.getDate() + delta);
				}

				if (!Number.isFinite(episodeNumber) || episodeNumber <= 1) {
					return toDateString(base);
				}

				const offsetCount = episodeNumber - 1;
				const dayDelta = cadenceUnit === 'days' ? cadenceCount * offsetCount : cadenceCount * 7 * offsetCount;
				base.setDate(base.getDate() - dayDelta);
				return toDateString(base);
			}

			function toDateString(date) {
				return date.toISOString().slice(0, 10);
			}

			function syncWeekdayFromStartDate() {
				if (weekdayManuallyChanged || !startDateField || !releaseWeekdayField || !startDateField.value) {
					return;
				}

				const selectedDate = new Date(startDateField.value + 'T00:00:00');
				const weekday = weekdayNames[selectedDate.getDay()];
				if (weekday) {
					releaseWeekdayField.value = weekday;
				}
			}

			function encodeConfigSegment(config) {
				const entries = Object.entries(config).filter(([, value]) => value !== undefined && value !== '');
				const json = JSON.stringify(Object.fromEntries(entries));
				const bytes = new TextEncoder().encode(json);
				let binary = '';
				const chunkSize = 0x8000;
				for (let index = 0; index < bytes.length; index += chunkSize) {
					binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
				}
				return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
			}

			function extractEncodedConfig(url) {
				const pathname = url.pathname.replace(/\/+$/, '');
				const pathMatch = pathname.match(/^\/r\/([^/]+)\/(?:feed\.xml|listen|edit)$/);
				if (pathMatch) {
					return pathMatch[1];
				}

				if (pathname === '/feed' || pathname === '/feed.xml' || pathname === '/listen') {
					const source = url.searchParams.get('source');
					if (!source) {
						return null;
					}

					return encodeConfigSegment({
						source,
						startDate: url.searchParams.get('startDate') ?? '',
						cadenceCount: url.searchParams.get('cadenceCount') ?? '',
						cadenceUnit: url.searchParams.get('cadenceUnit') ?? '',
						releaseWeekday: url.searchParams.get('releaseWeekday') ?? '',
						releaseTime: url.searchParams.get('releaseTime') ?? '',
						timeZone: url.searchParams.get('timeZone') ?? '',
						titleTemplate: url.searchParams.get('titleTemplate') ?? '',
						descriptionTemplate: url.searchParams.get('descriptionTemplate') ?? '',
					});
				}

				return null;
			}
		</script>
	</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function buildFeedUrl(
	requestUrl: URL,
	encodedConfig: string,
): string {
	return new URL(`/r/${encodedConfig}/feed.xml`, requestUrl.origin).toString();
}

function buildListenUrl(requestUrl: URL, params: ReplayFeedConfigParams): string {
	const encodedConfig = encodeReplayFeedConfig(params);
	return new URL(`/r/${encodedConfig}/listen`, requestUrl.origin).toString();
}

function buildEditUrl(requestUrl: URL, encodedConfig: string): URL {
	return new URL(`/r/${encodedConfig}/edit`, requestUrl.origin);
}

function buildFeedFormState(params: ReplayFeedConfigParams): FeedFormState {
	return {
		sourceUrl: params.source ?? defaultState.sourceUrl,
		startDate: params.startDate ?? defaultState.startDate,
		episodeNumber: '',
		cadenceCount: params.cadenceCount ?? defaultState.cadenceCount,
		cadenceUnit: (params.cadenceUnit as CadenceUnit | undefined) ?? defaultState.cadenceUnit,
		releaseWeekday: params.releaseWeekday ?? defaultState.releaseWeekday,
		releaseTime: params.releaseTime ?? defaultState.releaseTime,
		timeZone: params.timeZone ?? defaultState.timeZone,
		titleTemplate: params.titleTemplate ?? defaultState.titleTemplate,
		descriptionTemplate: params.descriptionTemplate ?? defaultState.descriptionTemplate,
	};
}

function fromLegacyQuery(query: Record<string, string | undefined>): ReplayFeedConfigParams {
	return {
		source: query.source,
		startDate: query.startDate,
		cadenceCount: query.cadenceCount,
		cadenceUnit: query.cadenceUnit,
		releaseWeekday: query.releaseWeekday,
		releaseTime: query.releaseTime,
		timeZone: query.timeZone,
		titleTemplate: query.titleTemplate,
		descriptionTemplate: query.descriptionTemplate,
	};
}

function hasExplicitWeekday(params: ReplayFeedConfigParams): boolean {
	return Boolean(params.releaseWeekday);
}

async function createWeakEtag(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const hash = Array.from(new Uint8Array(digest))
		.slice(0, 16)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	return `W/"${hash}"`;
}

function renderListenErrorPage(requestUrl: string, message: string): string {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Rewind Podcast Setup Error</title>
		<style>
			body {
				margin: 0;
				font-family: "Avenir Next", "Segoe UI", sans-serif;
				background: linear-gradient(180deg, #fff9f2 0%, #f6efe3 100%);
				color: #1f1a15;
			}
			main {
				max-width: 760px;
				margin: 0 auto;
				padding: 32px 20px 56px;
			}
			.panel {
				background: rgba(255, 252, 247, 0.92);
				border: 1px solid rgba(68, 51, 33, 0.12);
				border-radius: 20px;
				padding: 24px;
			}
			a {
				color: #bb4d00;
				font-weight: 700;
			}
		</style>
	</head>
	<body>
		<main>
			<div class="panel">
				<h1>We need one more fix before your feed URL is ready.</h1>
				<p>${escapeHtml(message)}</p>
				<p><a href="${escapeHtml(new URL('/', requestUrl).toString())}">Go back to the form</a></p>
			</div>
		</main>
	</body>
</html>`;
}

function renderListenPage(
	requestUrl: string,
	config: ReturnType<typeof parseReplayFeedConfig>,
	feedUrl: string,
	qrCodeSvg: string,
	encodedConfig: string,
): string {
	const appCards = PODCAST_APPS.map((app) => {
		return `<a class="subscribe-badge" href="${escapeHtml(app.subscribeUrl(feedUrl))}">
			<span class="badge-icon">${app.iconSvg}</span>
			<span class="badge-name">${escapeHtml(app.label)}</span>
		</a>`;
	}).join('');

	const backUrl = buildEditUrl(new URL(requestUrl), encodedConfig);

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Your Rewind Podcast Feed</title>
		<style>
			:root {
				--bg: #fbf6ee;
				--panel: rgba(255, 252, 247, 0.9);
				--text: #1f1a15;
				--muted: #6c5d4f;
				--line: rgba(68, 51, 33, 0.14);
				--accent: #bb4d00;
				--accent-soft: #ffe3cc;
				--shadow: 0 24px 60px rgba(87, 51, 20, 0.14);
			}
			* { box-sizing: border-box; }
			body {
				margin: 0;
				font-family: "Avenir Next", "Segoe UI", sans-serif;
				color: var(--text);
				background:
					radial-gradient(circle at top left, rgba(255, 214, 170, 0.9), transparent 34%),
					radial-gradient(circle at right center, rgba(253, 190, 138, 0.5), transparent 28%),
					linear-gradient(180deg, #fff9f2 0%, var(--bg) 55%, #f6efe3 100%);
				min-height: 100vh;
			}
			main {
				width: min(920px, calc(100vw - 32px));
				margin: 0 auto;
				padding: 40px 0 56px;
			}
			.panel {
				background: var(--panel);
				border: 1px solid var(--line);
				border-radius: 24px;
				box-shadow: var(--shadow);
				padding: 28px;
				margin-bottom: 24px;
			}
			.eyebrow {
				display: inline-block;
				margin-bottom: 14px;
				padding: 8px 12px;
				font-size: 12px;
				font-weight: 700;
				letter-spacing: 0.12em;
				text-transform: uppercase;
				border-radius: 999px;
				background: var(--accent-soft);
				color: var(--accent);
			}
			h1 { margin: 0 0 10px; font-size: clamp(2rem, 4vw, 4rem); line-height: 0.95; letter-spacing: -0.05em; }
			p { color: var(--muted); line-height: 1.55; }
			.feed-field {
				display: grid;
				grid-template-columns: 1fr auto;
				gap: 12px;
				align-items: center;
				margin-top: 14px;
			}
			input[type="text"] {
				width: 100%;
				padding: 14px 16px;
				border-radius: 14px;
				border: 1px solid rgba(76, 60, 41, 0.16);
				background: #fffdf8;
				color: var(--text);
				font: inherit;
			}
			button, .back-link {
				font: inherit;
				border: 0;
				border-radius: 14px;
				padding: 14px 18px;
				font-weight: 700;
				text-decoration: none;
			}
			button {
				cursor: pointer;
				color: white;
				background: linear-gradient(135deg, #bb4d00 0%, #dd7021 100%);
				box-shadow: 0 16px 30px rgba(187, 77, 0, 0.24);
			}
			.back-link {
				display: inline-block;
				margin-top: 12px;
				color: var(--accent);
				background: rgba(255, 255, 255, 0.6);
				border: 1px solid rgba(76, 60, 41, 0.12);
			}
			.subscribe-grid {
				display: flex;
				flex-wrap: wrap;
				gap: 12px 10px;
				margin-top: 12px;
			}
			.qr-shell {
				display: grid;
				grid-template-columns: 220px 1fr;
				gap: 20px;
				align-items: center;
				margin-top: 16px;
				padding: 18px;
				border-radius: 20px;
				background: rgba(255,255,255,0.5);
				border: 1px solid rgba(76, 60, 41, 0.08);
			}
			.qr-art {
				width: 220px;
				height: 220px;
				display: grid;
				place-items: center;
				border-radius: 18px;
				background: white;
				padding: 10px;
			}
			.qr-art svg {
				width: 100%;
				height: 100%;
				display: block;
			}
			.subscribe-badge {
				display: inline-flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				width: 5.25rem;
				padding: 8px 6px;
				text-align: center;
				text-decoration: none;
				color: var(--text);
				border-radius: 16px;
				background: rgba(255,255,255,0.55);
				border: 1px solid rgba(76, 60, 41, 0.08);
			}
			.subscribe-badge:hover {
				background: rgba(255,255,255,0.9);
			}
			.badge-icon svg {
				width: 3rem;
				height: 3rem;
				display: block;
				margin: 0 auto 0.35rem;
			}
			.badge-name {
				font-size: 0.76rem;
				line-height: 1.2;
			}
			.meta-list {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 12px;
				margin-top: 18px;
			}
			.meta {
				padding: 14px 16px;
				border-radius: 16px;
				background: rgba(255,255,255,0.5);
				border: 1px solid rgba(76, 60, 41, 0.08);
			}
			.meta strong {
				display: block;
				font-size: 0.78rem;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				color: var(--muted);
				margin-bottom: 6px;
			}
			.copy-status {
				margin-top: 10px;
				min-height: 1.3em;
				color: var(--accent);
				font-weight: 700;
			}
			@media (max-width: 720px) {
				main { width: min(100vw - 20px, 720px); padding-top: 20px; }
				.panel { padding: 20px; }
				.feed-field, .meta-list { grid-template-columns: 1fr; }
				.qr-shell { grid-template-columns: 1fr; }
				.qr-art { width: min(220px, 100%); height: auto; margin: 0 auto; aspect-ratio: 1; }
			}
		</style>
	</head>
	<body>
		<main>
			<section class="panel">
				<div class="eyebrow">Your Feed Is Ready</div>
				<h1>Add your rewind feed to a podcast app.</h1>
				<p>This page follows the ATP-style membership flow: copy the raw feed URL, or open it directly in a supported app.</p>

				<div class="feed-field">
					<input id="feed-url" type="text" readonly value="${escapeHtml(feedUrl)}" />
					<button id="copy-button" type="button">Copy Feed URL</button>
				</div>
				<div id="copy-status" class="copy-status"></div>

				<a class="back-link" href="${escapeHtml(backUrl.toString())}">Edit these settings</a>
			</section>

			<section class="panel">
				<h2 style="margin-top: 0;">Add directly to popular apps</h2>
				<p>Open this page on your phone with the QR code, then choose your preferred app below.</p>
				<div class="qr-shell">
					<div class="qr-art" aria-label="QR code linking back to this rewind feed page">${qrCodeSvg}</div>
					<div>
						<p style="margin-top: 0;">
							Scan this QR code with your phone camera. It opens this setup page, not a specific podcast app, so you can decide which app to use from there.
						</p>
						<p style="margin-bottom: 0;">
							If you're already on your phone, you can skip the QR code and choose an app directly.
						</p>
					</div>
				</div>
				<p style="margin-top: 20px;">Select an app:</p>
				<div class="subscribe-grid">${appCards}</div>
			</section>

			<section class="panel">
				<h2 style="margin-top: 0;">Replay settings</h2>
				<div class="meta-list">
					<div class="meta"><strong>Source Feed</strong>${escapeHtml(config.source)}</div>
					<div class="meta"><strong>Start Date</strong>${escapeHtml(config.startDate)}</div>
					<div class="meta"><strong>Cadence</strong>${escapeHtml(`${config.cadenceCount} ${config.cadenceUnit}`)}</div>
					<div class="meta"><strong>Release Time Zone</strong>${escapeHtml(config.timeZone)}</div>
				</div>
			</section>
		</main>
		<script>
			const button = document.getElementById('copy-button');
			const input = document.getElementById('feed-url');
			const status = document.getElementById('copy-status');

			button.addEventListener('click', async () => {
				try {
					if (navigator.clipboard?.writeText) {
						await navigator.clipboard.writeText(input.value);
					} else {
						input.focus();
						input.select();
						document.execCommand('copy');
					}
					status.textContent = 'Feed URL copied.';
				} catch (error) {
					input.focus();
					input.select();
					status.textContent = 'Select the URL and copy it manually.';
				}
			});
		</script>
	</body>
</html>`;
}

async function buildQrCodeSvg(value: string): Promise<string> {
	return await QRCode.toString(value, {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 1,
		color: {
			dark: '#1f1a15',
			light: '#0000',
		},
	});
}
