import { describe, expect, it } from 'vitest';
import {
	RSS_SOURCE_FEED,
	RSS_WITHOUT_CHANNEL,
	RSS_WITHOUT_ITEMS,
	UNSUPPORTED_XML_FEED,
} from './helpers/feed-fixtures';
import {
	assertWellFormedXml,
	requestFeedRoute,
} from './helpers/feed-test-utils';

describe('Feed route responses', () => {
	it('serves the rewritten feed with stable response headers', async () => {
		const response = await requestFeedRoute(RSS_SOURCE_FEED, {
			now: new Date('2026-05-15T12:00:00.000Z'),
		});
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=300, s-maxage=300, stale-while-revalidate=300',
		);
		expect(response.headers.get('etag')).toMatch(/^W\/"[0-9a-f]{32}"$/);
		expect(response.headers.get('last-modified')).toBe('Tue, 12 May 2026 09:00:00 GMT');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('content-length')).toBeTruthy();
		expect(body).toContain('<title>Source Podcast (Rewind)</title>');
		assertWellFormedXml(body);
	});

	it('supports HEAD requests for feed clients that only want metadata', async () => {
		const response = await requestFeedRoute(RSS_SOURCE_FEED, {
			now: new Date('2026-05-15T12:00:00.000Z'),
			requestMethod: 'HEAD',
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
		expect(response.headers.get('etag')).toMatch(/^W\/"[0-9a-f]{32}"$/);
		expect(await response.text()).toBe('');
	});

	it('returns 304 when the caller sends a matching If-None-Match header', async () => {
		const firstResponse = await requestFeedRoute(RSS_SOURCE_FEED, {
			now: new Date('2026-05-15T12:00:00.000Z'),
		});
		const etag = firstResponse.headers.get('etag');
		expect(etag).toBeTruthy();

		const secondResponse = await requestFeedRoute(RSS_SOURCE_FEED, {
			now: new Date('2026-05-15T12:00:00.000Z'),
			requestHeaders: { 'if-none-match': etag ?? '' },
		});

		expect(secondResponse.status).toBe(304);
		expect(await secondResponse.text()).toBe('');
	});

	it('surfaces upstream HTTP failures as feed generation errors', async () => {
		const response = await requestFeedRoute(RSS_SOURCE_FEED, {
			now: new Date('2026-05-15T12:00:00.000Z'),
			status: 502,
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Source feed request failed with status 502.');
	});

	it('rejects RSS feeds that are missing a channel', async () => {
		const response = await requestFeedRoute(RSS_WITHOUT_CHANNEL, {
			now: new Date('2026-05-15T12:00:00.000Z'),
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Invalid RSS feed: missing <channel>.');
	});

	it('rejects RSS feeds that contain no items', async () => {
		const response = await requestFeedRoute(RSS_WITHOUT_ITEMS, {
			now: new Date('2026-05-15T12:00:00.000Z'),
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('RSS feed contains no <item> entries.');
	});

	it('rejects unsupported XML feeds', async () => {
		const response = await requestFeedRoute(UNSUPPORTED_XML_FEED, {
			now: new Date('2026-05-15T12:00:00.000Z'),
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe(
			'Unsupported feed format. Expected an RSS or Atom podcast feed.',
		);
	});
});
