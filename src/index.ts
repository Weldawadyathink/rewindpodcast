import { Hono } from 'hono';
import QRCode from 'qrcode';
import { buildReplayFeed, parseReplayFeedConfig, type CadenceUnit } from './feed';
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
	const requestUrl = new URL(c.req.url);
	const state: FeedFormState = {
		sourceUrl: requestUrl.searchParams.get('source') ?? defaultState.sourceUrl,
		startDate: requestUrl.searchParams.get('startDate') ?? defaultState.startDate,
		episodeNumber: '',
		cadenceCount: requestUrl.searchParams.get('cadenceCount') ?? defaultState.cadenceCount,
		cadenceUnit: (requestUrl.searchParams.get('cadenceUnit') as CadenceUnit | null) ?? defaultState.cadenceUnit,
		releaseWeekday: requestUrl.searchParams.get('releaseWeekday') ?? defaultState.releaseWeekday,
		releaseTime: requestUrl.searchParams.get('releaseTime') ?? defaultState.releaseTime,
		timeZone: requestUrl.searchParams.get('timeZone') ?? defaultState.timeZone,
		titleTemplate: requestUrl.searchParams.get('titleTemplate') ?? defaultState.titleTemplate,
		descriptionTemplate: requestUrl.searchParams.get('descriptionTemplate') ?? defaultState.descriptionTemplate,
	};

	return c.html(renderHomePage(state, c.req.url));
});

app.get('/healthz', (c) =>
	c.json({
		ok: true,
		service: 'rewindpodcast',
		timestamp: new Date().toISOString(),
	}),
);

app.get('/listen', async (c) => {
	try {
		const config = parseReplayFeedConfig(c.req.query());
		const feedUrl = buildFeedUrl(new URL(c.req.url), c.req.query());
		const qrCodeSvg = await buildQrCodeSvg(c.req.url);
		return c.html(renderListenPage(c.req.url, config, feedUrl, qrCodeSvg));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid replay settings.';
		return c.html(renderListenErrorPage(c.req.url, message), 400);
	}
});

app.get('/feed', async (c) => {
	try {
		const config = parseReplayFeedConfig(c.req.query());
		const result = await buildReplayFeed(config);

		for (const diagnostic of result.diagnostics) {
			console.warn(
				JSON.stringify({
					diagnostic,
					kind: result.kind,
					scope: 'rewindpodcast',
				}),
			);
		}

		c.header('cache-control', 'no-store, max-age=0');
		return new Response(result.xml, {
			headers: {
				'cache-control': 'no-store, max-age=0',
				'content-type': result.contentType,
			},
		});
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
});

export default app;

function renderHomePage(state: FeedFormState, requestUrl: string): string {
	const request = new URL(requestUrl);
	const escapedState = JSON.stringify(state).replace(/</g, '\\u003c');
	const hasExplicitWeekday = request.searchParams.has('releaseWeekday');
	const exampleUrl = `${request.origin}/listen?source=${encodeURIComponent('https://feeds.relay.fm/rd.xml')}&startDate=2026-05-04&cadenceCount=1&cadenceUnit=weeks&releaseWeekday=monday&releaseTime=09:00&timeZone=America%2FLos_Angeles`;

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
		</main>
		<script>
			const initialState = ${escapedState};
			const hasExplicitWeekday = ${JSON.stringify(hasExplicitWeekday)};
			const form = document.getElementById('generator-form');
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
				const url = new URL('/listen', window.location.origin);
				url.searchParams.set('source', sourceUrl);
				url.searchParams.set('startDate', adjustedStartDate);
				url.searchParams.set('cadenceCount', String(cadenceCount));
				url.searchParams.set('cadenceUnit', cadenceUnit);
				url.searchParams.set('releaseWeekday', releaseWeekday);
				url.searchParams.set('releaseTime', releaseTime);
				url.searchParams.set('timeZone', timeZone);

				if (titleTemplate) {
					url.searchParams.set('titleTemplate', titleTemplate);
				}

				if (descriptionTemplate) {
					url.searchParams.set('descriptionTemplate', descriptionTemplate);
				}

				output.textContent = url.toString();
				window.location.assign(url.toString());
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
		</script>
	</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function buildFeedUrl(requestUrl: URL, query: Record<string, string | undefined>): string {
	const feedUrl = new URL('/feed', requestUrl.origin);
	for (const [key, value] of Object.entries(query)) {
		if (value) {
			feedUrl.searchParams.set(key, value);
		}
	}
	return feedUrl.toString();
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
): string {
	const appCards = PODCAST_APPS.map((app) => {
		return `<a class="subscribe-badge" href="${escapeHtml(app.subscribeUrl(feedUrl))}">
			<span class="badge-icon">${app.iconSvg}</span>
			<span class="badge-name">${escapeHtml(app.label)}</span>
		</a>`;
	}).join('');

	const backUrl = new URL('/', requestUrl);
	backUrl.searchParams.set('source', config.source);
	backUrl.searchParams.set('startDate', config.startDate);
	backUrl.searchParams.set('cadenceCount', String(config.cadenceCount));
	backUrl.searchParams.set('cadenceUnit', config.cadenceUnit);
	backUrl.searchParams.set('releaseWeekday', config.releaseWeekday);
	backUrl.searchParams.set('releaseTime', config.releaseTime);
	backUrl.searchParams.set('timeZone', config.timeZone);
	backUrl.searchParams.set('titleTemplate', config.titleTemplate);
	backUrl.searchParams.set('descriptionTemplate', config.descriptionTemplate);

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
