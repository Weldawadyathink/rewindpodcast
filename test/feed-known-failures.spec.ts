import { describe, expect, it } from 'vitest';
import {
	ATOM_SOURCE_FEED,
	RSS_OLDEST_FIRST_SOURCE_FEED,
	RSS_WITH_PLAIN_TEXT_CDATA,
	createLatin1EncodedRssFeedBytes,
} from './helpers/feed-fixtures';
import {
	buildFeedFromSource,
} from './helpers/feed-test-utils';

describe('Known feed bugs', () => {
	it('uses standard Atom self links instead of injecting RSS-style atom:link elements', async () => {
		const result = await buildFeedFromSource(ATOM_SOURCE_FEED, {
			config: {
				source: 'https://source.example.com/atom.xml',
			},
			feedUrl: 'https://rewindpodcast.xyz/r/test/feed.xml',
			headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
			now: new Date('2026-06-30T12:00:00.000Z'),
			sourceUrl: 'https://source.example.com/atom.xml',
		});

		expect(result.xml).toContain(
			'<link href="https://rewindpodcast.xyz/r/test/feed.xml" rel="self" />',
		);
		expect(result.xml).not.toContain('<atom:link');
	});

	it('uses the newest visible replay episode as the feed-level freshness timestamp', async () => {
		const result = await buildFeedFromSource(RSS_OLDEST_FIRST_SOURCE_FEED, {
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		expect(result.lastModified).toBe('Tue, 19 May 2026 09:00:00 GMT');
		expect(result.xml).toContain('<pubDate>Tue, 19 May 2026 09:00:00 GMT</pubDate>');
		expect(result.xml).toContain('<lastBuildDate>Tue, 19 May 2026 09:00:00 GMT</lastBuildDate>');
	});

	it('includes the note label when plain text is wrapped in a CDATA description', async () => {
		const result = await buildFeedFromSource(RSS_WITH_PLAIN_TEXT_CDATA, {
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		expect(result.xml).toContain('Originally released: January 3, 2022');
	});

	it('decodes non-UTF-8 source feeds according to the source encoding', async () => {
		const result = await buildFeedFromSource(createLatin1EncodedRssFeedBytes(), {
			headers: { 'content-type': 'application/rss+xml; charset=iso-8859-1' },
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		expect(result.xml).toContain('Café Podcast');
		expect(result.xml).toContain('Épisode 1');
	});
});
