import { Hono } from 'hono';

type CadenceUnit = 'days' | 'weeks';

type FeedFormState = {
	sourceUrl: string;
	startDate: string;
	episodeNumber: string;
	cadenceCount: string;
	cadenceUnit: CadenceUnit;
	releaseWeekday: string;
	releaseTime: string;
	timeZone: string;
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
};

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.html(renderHomePage(defaultState, c.req.url)));

app.get('/healthz', (c) =>
	c.json({
		ok: true,
		service: 'rewindpodcast',
		timestamp: new Date().toISOString(),
	}),
);

app.get('/feed', (c) => {
	// The feed rewrite pipeline is intentionally not implemented in the initial scaffold.
	// This endpoint echoes the accepted configuration shape so we can iterate against a stable contract.
	const params = c.req.query();

	return c.json(
		{
			message: 'Feed rewriting is not implemented yet.',
			status: 'scaffold',
			acceptedQueryShape: {
				source: 'https://example.com/feed.xml',
				startDate: '2026-01-05',
				cadenceCount: 1,
				cadenceUnit: 'weeks',
				releaseWeekday: 'monday',
				releaseTime: '09:00',
				timeZone: 'America/Los_Angeles',
			},
			received: params,
		},
		501,
	);
});

export default app;

function renderHomePage(state: FeedFormState, requestUrl: string): string {
	const escapedState = JSON.stringify(state).replace(/</g, '\\u003c');
	const exampleUrl = `${new URL(requestUrl).origin}/feed?source=${encodeURIComponent('https://feeds.relay.fm/rd.xml')}&startDate=2026-05-04&cadenceCount=1&cadenceUnit=weeks&releaseWeekday=monday&releaseTime=09:00&timeZone=America%2FLos_Angeles`;

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
					The Worker will eventually rewrite publish dates, hide episodes that have not "released" yet, and preserve the original episode media files.
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
								<span>Episode number to treat as newest on that date</span>
								<input id="episodeNumber" name="episodeNumber" type="number" min="1" step="1" placeholder="Optional" />
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

						<div class="field-grid">
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
								<span>Release time</span>
								<input id="releaseTime" name="releaseTime" type="time" value="09:00" required />
							</label>
						</div>

						<label>
							<span>Time zone</span>
							<input id="timeZone" name="timeZone" type="text" value="America/Los_Angeles" required />
						</label>

						<p class="help">
							If you enter an episode number, the website will calculate an adjusted start date so that episode becomes the newest available episode on your chosen day.
							That convenience is for the website only and does not need to appear in the final feed URL.
						</p>

						<p class="help">
							A later version of this form will include advanced channel-title controls so users can keep the original title, use a default replay template, or provide a custom title.
						</p>

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

					<p class="output-note">Example generated URL</p>
					<pre id="output">${escapeHtml(exampleUrl)}</pre>
				</section>
			</div>
		</main>
		<script>
			const initialState = ${escapedState};
			const form = document.getElementById('generator-form');
			const output = document.getElementById('output');
			const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

			for (const [key, value] of Object.entries(initialState)) {
				const field = document.getElementById(key);
				if (field && value) field.value = value;
			}

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

				if (!sourceUrl || !startDate || !cadenceCount || !releaseTime || !timeZone) {
					output.textContent = 'Please complete the required fields first.';
					return;
				}

				const adjustedStartDate = calculateStartDate(startDate, releaseWeekday, cadenceCount, cadenceUnit, episodeNumber);
				const url = new URL('/feed', window.location.origin);
				url.searchParams.set('source', sourceUrl);
				url.searchParams.set('startDate', adjustedStartDate);
				url.searchParams.set('cadenceCount', String(cadenceCount));
				url.searchParams.set('cadenceUnit', cadenceUnit);
				url.searchParams.set('releaseWeekday', releaseWeekday);
				url.searchParams.set('releaseTime', releaseTime);
				url.searchParams.set('timeZone', timeZone);

				output.textContent = url.toString();
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
		</script>
	</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
