import { exports } from 'cloudflare:workers';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { afterEach, expect, vi } from 'vitest';
import {
	buildReplayFeed,
	encodeReplayFeedConfig,
	replayFeedConfigToParams,
	type ReplayFeedConfig,
} from '../../src/feed';

type MockFetchResponse = {
	body: BodyInit;
	headers?: HeadersInit;
	status?: number;
	statusText?: string;
};

const parser = new XMLParser({
	attributeNamePrefix: '@_',
	ignoreAttributes: false,
	parseTagValue: false,
	trimValues: false,
});

const DEFAULT_CONFIG: ReplayFeedConfig = {
	cadenceCount: 1,
	cadenceUnit: 'weeks',
	descriptionTemplate: 'Replay feed for {{title}}. Episodes release every {{cadenceCount}} {{cadenceUnit}}.\n{{description}}',
	releaseTime: '09:00',
	releaseWeekday: 'tuesday',
	source: 'https://source.example.com/feed.xml',
	startDate: '2026-05-05',
	timeZone: 'UTC',
	titleTemplate: '{{title}} (Rewind)',
};

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

export function buildConfig(overrides: Partial<ReplayFeedConfig> = {}): ReplayFeedConfig {
	return {
		...DEFAULT_CONFIG,
		...overrides,
	};
}

export function mockUpstreamFetch(responses: Record<string, MockFetchResponse>): void {
	vi.stubGlobal(
		'fetch',
		(async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			const response = responses[url];
			if (!response) {
				throw new Error(`Unexpected upstream fetch: ${url}`);
			}

			return new Response(response.body, {
				headers: response.headers,
				status: response.status,
				statusText: response.statusText,
			});
		}) as typeof fetch,
	);
}

export async function buildFeedFromSource(
	xml: BodyInit,
	options: {
		config?: Partial<ReplayFeedConfig>;
		feedUrl?: string;
		headers?: HeadersInit;
		now?: Date;
		sourceUrl?: string;
		status?: number;
	} = {},
) {
	const config = buildConfig({
		...options.config,
		source: options.sourceUrl ?? options.config?.source ?? DEFAULT_CONFIG.source,
	});
	mockUpstreamFetch({
		[config.source]: {
			body: xml,
			headers: options.headers ?? { 'content-type': 'application/rss+xml; charset=utf-8' },
			status: options.status ?? 200,
		},
	});
	return await buildReplayFeed(config, { feedUrl: options.feedUrl }, options.now ?? new Date('2026-06-30T12:00:00.000Z'));
}

export async function requestFeedRoute(
	xml: BodyInit,
	options: {
		config?: Partial<ReplayFeedConfig>;
		headers?: HeadersInit;
		now?: Date;
		requestHeaders?: HeadersInit;
		requestMethod?: string;
		sourceUrl?: string;
		status?: number;
	} = {},
): Promise<Response> {
	const config = buildConfig({
		...options.config,
		source: options.sourceUrl ?? options.config?.source ?? DEFAULT_CONFIG.source,
	});
	const encoded = encodeReplayFeedConfig(replayFeedConfigToParams(config));
	const requestUrl = `https://rewindpodcast.xyz/r/${encoded}/feed.xml`;

	mockUpstreamFetch({
		[config.source]: {
			body: xml,
			headers: options.headers ?? { 'content-type': 'application/rss+xml; charset=utf-8' },
			status: options.status ?? 200,
		},
	});

	if (options.now) {
		vi.useFakeTimers();
		vi.setSystemTime(options.now);
	}

	const request = new Request(requestUrl, {
		headers: options.requestHeaders,
		method: options.requestMethod,
	});
	return await exports.default.fetch(request);
}

export function assertWellFormedXml(xml: string): void {
	const validation = XMLValidator.validate(xml);
	expect(validation).toBe(true);
}

export function parseXml(xml: string) {
	return parser.parse(xml);
}

export function countTag(xml: string, tagName: string): number {
	return [...xml.matchAll(new RegExp(`<${escapeRegExp(tagName)}\\b`, 'g'))].length;
}

export function extractRssItem(xml: string, title: string): string {
	const match = xml.match(
		new RegExp(
			`<item\\b[\\s\\S]*?<title>${escapeRegExp(title)}</title>[\\s\\S]*?<\\/item>`,
			'i',
		),
	);
	if (!match) {
		throw new Error(`Missing RSS item: ${title}`);
	}
	return match[0];
}

export function extractAtomEntry(xml: string, title: string): string {
	const match = xml.match(
		new RegExp(
			`<entry\\b[\\s\\S]*?<title>${escapeRegExp(title)}</title>[\\s\\S]*?<\\/entry>`,
			'i',
		),
	);
	if (!match) {
		throw new Error(`Missing Atom entry: ${title}`);
	}
	return match[0];
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
