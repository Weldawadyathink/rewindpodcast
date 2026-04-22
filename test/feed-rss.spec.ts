import { describe, expect, it } from 'vitest';
import {
	RSS_OLDEST_FIRST_SOURCE_FEED,
	RSS_SOURCE_FEED,
	RSS_WITH_MALFORMED_HTML_IN_CDATA,
	RSS_WITH_MISSING_PUBLISH_DATE,
} from './helpers/feed-fixtures';
import {
	assertWellFormedXml,
	buildFeedFromSource,
	countTag,
	extractRssItem,
} from './helpers/feed-test-utils';

describe('RSS feed rewriting', () => {
	it('rewrites dates, trims future items, preserves order, and adds an RSS self link', async () => {
		const result = await buildFeedFromSource(RSS_SOURCE_FEED, {
			feedUrl: 'https://rewindpodcast.xyz/r/test/feed.xml',
			now: new Date('2026-05-15T12:00:00.000Z'),
		});

		expect(result.kind).toBe('rss');
		expect(result.contentType).toBe('application/rss+xml; charset=utf-8');
		expect(result.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(result.xml).toContain(
			'<atom:link href="https://rewindpodcast.xyz/r/test/feed.xml" rel="self" type="application/rss+xml" />',
		);
		expect(countTag(result.xml, 'item')).toBe(2);
		expect(result.xml).not.toContain('<title>Episode 3</title>');
		expect(result.xml.indexOf('<title>Episode 2</title>')).toBeLessThan(
			result.xml.indexOf('<title>Episode 1</title>'),
		);

		const episodeTwo = extractRssItem(result.xml, 'Episode 2');
		const episodeOne = extractRssItem(result.xml, 'Episode 1');
		expect(episodeTwo).toContain('<pubDate>Tue, 12 May 2026 09:00:00 GMT</pubDate>');
		expect(episodeOne).toContain('<pubDate>Tue, 05 May 2026 09:00:00 GMT</pubDate>');
		expect(episodeTwo).toContain('https://cdn.example.com/e2.mp3');
		expect(episodeOne).toContain('https://cdn.example.com/e1.mp3');
		assertWellFormedXml(result.xml);
	});

	it('prefers content:encoded for note injection and leaves description fallback untouched', async () => {
		const result = await buildFeedFromSource(RSS_SOURCE_FEED, {
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		const episodeThree = extractRssItem(result.xml, 'Episode 3');
		expect(episodeThree).toContain(
			'<content:encoded><![CDATA[<p><strong>Originally released:</strong> January 3, 2022</p>',
		);
		expect(episodeThree).toContain('<p>Episode 3 full notes.</p>]]></content:encoded>');
		expect(episodeThree).toContain('<description>Episode 3 fallback.</description>');
		expect(episodeThree).not.toContain(
			'<description>Originally released: January 3, 2022',
		);
	});

	it('injects note text into plain descriptions when no richer field exists', async () => {
		const result = await buildFeedFromSource(RSS_SOURCE_FEED, {
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		const episodeTwo = extractRssItem(result.xml, 'Episode 2');
		expect(episodeTwo).toContain('Originally released: December 27, 2021');
		expect(episodeTwo).toContain('Episode 2 fallback.');
	});

	it('falls back to source order when any episode is missing a usable publish date', async () => {
		const result = await buildFeedFromSource(RSS_WITH_MISSING_PUBLISH_DATE, {
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		expect(result.diagnostics).toContain(
			'Some episodes are missing usable publish dates; falling back to feed order.',
		);

		const alpha = extractRssItem(result.xml, 'Alpha');
		const beta = extractRssItem(result.xml, 'Beta');
		const gamma = extractRssItem(result.xml, 'Gamma');
		expect(alpha).toContain('<pubDate>Tue, 05 May 2026 09:00:00 GMT</pubDate>');
		expect(beta).toContain('<pubDate>Tue, 12 May 2026 09:00:00 GMT</pubDate>');
		expect(gamma).toContain('<pubDate>Tue, 19 May 2026 09:00:00 GMT</pubDate>');
		assertWellFormedXml(result.xml);
	});

	it('preserves malformed upstream HTML that lives inside CDATA', async () => {
		const result = await buildFeedFromSource(RSS_WITH_MALFORMED_HTML_IN_CDATA, {
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		const brokenEpisode = extractRssItem(result.xml, 'Episode Broken');
		expect(brokenEpisode).toContain('<p><strong>Broken markup</p><p>Still here.</p>');
		expect(brokenEpisode).toContain(
			'<p><strong>Originally released:</strong> January 3, 2022</p>',
		);
		assertWellFormedXml(result.xml);
	});

	it('applies custom channel title and description templates', async () => {
		const result = await buildFeedFromSource(RSS_OLDEST_FIRST_SOURCE_FEED, {
			config: {
				descriptionTemplate:
					'Replay from {{startDate}} for {{title}}. {{description}}',
				titleTemplate: 'Replay: {{title}}',
			},
			now: new Date('2026-06-30T12:00:00.000Z'),
		});

		expect(result.xml).toContain('<title>Replay: Chronological Podcast</title>');
		expect(result.xml).toContain(
			'<description>Replay from 2026-05-05 for Chronological Podcast. Oldest episodes come first.</description>',
		);
		assertWellFormedXml(result.xml);
	});
});
