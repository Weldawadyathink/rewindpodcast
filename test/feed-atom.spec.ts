import { describe, expect, it } from 'vitest';
import { ATOM_SOURCE_FEED } from './helpers/feed-fixtures';
import {
	buildFeedFromSource,
	countTag,
	extractAtomEntry,
} from './helpers/feed-test-utils';

describe('Atom feed rewriting', () => {
	it('rewrites entry dates, trims future entries, and preserves source order', async () => {
		const result = await buildFeedFromSource(ATOM_SOURCE_FEED, {
			config: {
				source: 'https://source.example.com/atom.xml',
			},
			headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
			now: new Date('2026-05-15T12:00:00.000Z'),
			sourceUrl: 'https://source.example.com/atom.xml',
		});

		expect(result.kind).toBe('atom');
		expect(result.contentType).toBe('application/atom+xml; charset=utf-8');
		expect(countTag(result.xml, 'entry')).toBe(2);
		expect(result.xml).not.toContain('<title>Entry 3</title>');
		expect(result.xml.indexOf('<title>Entry 2</title>')).toBeLessThan(
			result.xml.indexOf('<title>Entry 1</title>'),
		);

		const entryTwo = extractAtomEntry(result.xml, 'Entry 2');
		const entryOne = extractAtomEntry(result.xml, 'Entry 1');
		expect(entryTwo).toContain('<updated>2026-05-12T09:00:00.000Z</updated>');
		expect(entryTwo).toContain('<published>2026-05-12T09:00:00.000Z</published>');
		expect(entryOne).toContain('<updated>2026-05-05T09:00:00.000Z</updated>');
		expect(entryOne).toContain('<published>2026-05-05T09:00:00.000Z</published>');
	});

	it('injects the original release note into Atom content before existing markup', async () => {
		const result = await buildFeedFromSource(ATOM_SOURCE_FEED, {
			config: {
				source: 'https://source.example.com/atom.xml',
			},
			headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
			now: new Date('2026-06-30T12:00:00.000Z'),
			sourceUrl: 'https://source.example.com/atom.xml',
		});

		const entryThree = extractAtomEntry(result.xml, 'Entry 3');
		expect(entryThree).toContain(
			'<content type="html"><![CDATA[<p><strong>Originally released:</strong> January 3, 2022</p>',
		);
		expect(entryThree).toContain('<p>Entry 3 full notes.</p>]]></content>');
		expect(entryThree).toContain('<summary>Entry 3 summary.</summary>');
	});

	it('applies custom Atom title and subtitle templates', async () => {
		const result = await buildFeedFromSource(ATOM_SOURCE_FEED, {
			config: {
				descriptionTemplate: 'Replay subtitle for {{title}}.',
				source: 'https://source.example.com/atom.xml',
				titleTemplate: 'Replay Atom: {{title}}',
			},
			headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
			now: new Date('2026-06-30T12:00:00.000Z'),
			sourceUrl: 'https://source.example.com/atom.xml',
		});

		expect(result.xml).toContain('<title>Replay Atom: Atom Source Podcast</title>');
		expect(result.xml).toContain('<subtitle>Replay subtitle for Atom Source Podcast.</subtitle>');
	});
});
