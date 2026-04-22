export type CadenceUnit = 'days' | 'weeks';
export type ReleaseWeekday =
	| 'sunday'
	| 'monday'
	| 'tuesday'
	| 'wednesday'
	| 'thursday'
	| 'friday'
	| 'saturday';

export type FeedKind = 'rss' | 'atom';

export type ReplayFeedConfig = {
	source: string;
	startDate: string;
	cadenceCount: number;
	cadenceUnit: CadenceUnit;
	releaseWeekday: ReleaseWeekday;
	releaseTime: string;
	timeZone: string;
	titleTemplate: string;
	descriptionTemplate: string;
};

export type ReplayFeedConfigParams = {
	source?: string;
	startDate?: string;
	cadenceCount?: string;
	cadenceUnit?: string;
	releaseWeekday?: string;
	releaseTime?: string;
	timeZone?: string;
	titleTemplate?: string;
	descriptionTemplate?: string;
};

export type ReplayFeedResult = {
	contentType: string;
	diagnostics: string[];
	kind: FeedKind;
	lastModified?: string;
	xml: string;
};

type BuildReplayFeedOptions = {
	feedUrl?: string;
};

type ParsedItem = {
	block: string;
	index: number;
	originalDateText: string | null;
	parsedDateMs: number | null;
};

type ScheduledItem = ParsedItem & {
	replayDateMs: number;
	replayDateText: string;
	shouldInclude: boolean;
};

type ChannelTemplateContext = {
	cadenceCount: number;
	cadenceUnit: CadenceUnit;
	description: string;
	releaseTime: string;
	releaseWeekday: ReleaseWeekday;
	source: string;
	startDate: string;
	timeZone: string;
	title: string;
};

const DEFAULT_TITLE_TEMPLATE = '{{title}} (Rewind)';
const DEFAULT_DESCRIPTION_TEMPLATE =
	'Replay feed for {{title}}. Episodes release every {{cadenceCount}} {{cadenceUnit}}.\n{{description}}';
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const RSS_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';
const ATOM_CONTENT_TYPE = 'application/atom+xml; charset=utf-8';
const WEEKDAY_INDEX: Record<ReleaseWeekday, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};

export function parseReplayFeedConfig(params: ReplayFeedConfigParams): ReplayFeedConfig {
	const source = readUrlParam(params.source, 'source');
	const startDate = readDateParam(params.startDate, 'startDate');
	const cadenceCount = readPositiveInteger(params.cadenceCount ?? '1', 'cadenceCount');
	const cadenceUnit = readCadenceUnit(params.cadenceUnit ?? 'weeks');
	const releaseWeekday = readWeekday(params.releaseWeekday ?? 'monday');
	const releaseTime = readTimeParam(params.releaseTime ?? '09:00', 'releaseTime');
	const timeZone = readTimeZoneParam(params.timeZone ?? 'America/Los_Angeles');
	return {
		source,
		startDate,
		cadenceCount,
		cadenceUnit,
		releaseWeekday,
		releaseTime,
		timeZone,
		titleTemplate: params.titleTemplate?.trim() || DEFAULT_TITLE_TEMPLATE,
		descriptionTemplate: params.descriptionTemplate?.trim() || DEFAULT_DESCRIPTION_TEMPLATE,
	};
}

export function encodeReplayFeedConfig(params: ReplayFeedConfigParams): string {
	const normalized = Object.fromEntries(
		Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
	);
	return encodeBase64Url(JSON.stringify(normalized));
}

export function decodeReplayFeedConfig(encoded: string): ReplayFeedConfigParams {
	let parsed: unknown;
	try {
		parsed = JSON.parse(decodeBase64Url(encoded));
	} catch {
		throw new Error('Invalid rewind feed URL.');
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Invalid rewind feed URL.');
	}

	const raw = parsed as Record<string, unknown>;
	const result: ReplayFeedConfigParams = {};
	for (const key of [
		'source',
		'startDate',
		'cadenceCount',
		'cadenceUnit',
		'releaseWeekday',
		'releaseTime',
		'timeZone',
		'titleTemplate',
		'descriptionTemplate',
	] satisfies Array<keyof ReplayFeedConfigParams>) {
		const value = raw[key];
		if (value === undefined) {
			continue;
		}
		if (typeof value !== 'string') {
			throw new Error('Invalid rewind feed URL.');
		}
		result[key] = value;
	}

	return result;
}

export function replayFeedConfigToParams(config: ReplayFeedConfig): ReplayFeedConfigParams {
	return {
		source: config.source,
		startDate: config.startDate,
		cadenceCount: String(config.cadenceCount),
		cadenceUnit: config.cadenceUnit,
		releaseWeekday: config.releaseWeekday,
		releaseTime: config.releaseTime,
		timeZone: config.timeZone,
		titleTemplate: config.titleTemplate === DEFAULT_TITLE_TEMPLATE ? undefined : config.titleTemplate,
		descriptionTemplate:
			config.descriptionTemplate === DEFAULT_DESCRIPTION_TEMPLATE ? undefined : config.descriptionTemplate,
	};
}

export async function buildReplayFeed(
	config: ReplayFeedConfig,
	options: BuildReplayFeedOptions = {},
	now: Date = new Date(),
): Promise<ReplayFeedResult> {
	const response = await fetch(config.source, {
		headers: {
			accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
			'user-agent': 'rewindpodcast/0.1 (+https://github.com/Weldawadyathink/rewindpodcast)',
		},
		redirect: 'follow',
	});

	if (!response.ok) {
		throw new Error(`Source feed request failed with status ${response.status}.`);
	}

	const xml = await readResponseText(response, MAX_FEED_BYTES);
	const diagnostics: string[] = [];

	if (looksLikeRss(xml)) {
		return {
			contentType: RSS_CONTENT_TYPE,
			diagnostics,
			kind: 'rss',
			...rewriteRssFeed(xml, config, now, diagnostics, options.feedUrl),
		};
	}

	if (looksLikeAtom(xml)) {
		return {
			contentType: ATOM_CONTENT_TYPE,
			diagnostics,
			kind: 'atom',
			...rewriteAtomFeed(xml, config, now, diagnostics, options.feedUrl),
		};
	}

	throw new Error('Unsupported feed format. Expected an RSS or Atom podcast feed.');
}

function rewriteRssFeed(
	xml: string,
	config: ReplayFeedConfig,
	now: Date,
	diagnostics: string[],
	feedUrl?: string,
): Pick<ReplayFeedResult, 'lastModified' | 'xml'> {
	const channelMatch = xml.match(/(<channel\b[^>]*>)([\s\S]*?)(<\/channel>)/i);
	if (!channelMatch || channelMatch.index === undefined) {
		throw new Error('Invalid RSS feed: missing <channel>.');
	}

	const [fullChannel, channelOpen, channelInner, channelClose] = channelMatch;
	const itemMatches = [...channelInner.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
	if (itemMatches.length === 0) {
		throw new Error('RSS feed contains no <item> entries.');
	}

	const channelHeadEnd = itemMatches[0]?.index ?? channelInner.length;
	const channelHead = channelInner.slice(0, channelHeadEnd);
	const channelTail = channelInner.slice(channelHeadEnd);
	const tailItemMatches = [...channelTail.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
	const scheduledItems = scheduleItems(
		itemMatches.map((match, index) => parseRssItem(match[0], index)),
		config,
		now,
		diagnostics,
	);
	const rewrittenHead = rewriteRssChannelMetadata(channelHead, config, scheduledItems, feedUrl);
	const rewrittenTail = rebuildFeedBody(channelTail, tailItemMatches, scheduledItems, rewriteRssItem, diagnostics);
	const rewrittenChannel = `${channelOpen}${rewrittenHead}${rewrittenTail}${channelClose}`;
	const rewrittenXml = `${xml.slice(0, channelMatch.index)}${rewrittenChannel}${xml.slice(channelMatch.index + fullChannel.length)}`;
	return {
		lastModified: scheduledItems.find((item) => item.shouldInclude)?.replayDateText,
		xml: ensureXmlDeclaration(ensureRssSelfLink(rewrittenXml, feedUrl)),
	};
}

function rewriteAtomFeed(
	xml: string,
	config: ReplayFeedConfig,
	now: Date,
	diagnostics: string[],
	feedUrl?: string,
): Pick<ReplayFeedResult, 'lastModified' | 'xml'> {
	const feedMatch = xml.match(/(<feed\b[^>]*>)([\s\S]*?)(<\/feed>)/i);
	if (!feedMatch || feedMatch.index === undefined) {
		throw new Error('Invalid Atom feed: missing <feed>.');
	}

	const [fullFeed, feedOpen, feedInner, feedClose] = feedMatch;
	const entryMatches = [...feedInner.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
	if (entryMatches.length === 0) {
		throw new Error('Atom feed contains no <entry> elements.');
	}

	const feedHeadEnd = entryMatches[0]?.index ?? feedInner.length;
	const feedHead = feedInner.slice(0, feedHeadEnd);
	const feedTail = feedInner.slice(feedHeadEnd);
	const tailEntryMatches = [...feedTail.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
	const scheduledItems = scheduleItems(
		entryMatches.map((match, index) => parseAtomEntry(match[0], index)),
		config,
		now,
		diagnostics,
	);
	const rewrittenHead = rewriteAtomChannelMetadata(feedHead, config, scheduledItems, feedUrl);
	const rewrittenTail = rebuildFeedBody(feedTail, tailEntryMatches, scheduledItems, rewriteAtomEntry, diagnostics);
	const rewrittenFeed = `${feedOpen}${rewrittenHead}${rewrittenTail}${feedClose}`;
	const rewrittenXml = `${xml.slice(0, feedMatch.index)}${rewrittenFeed}${xml.slice(feedMatch.index + fullFeed.length)}`;
	return {
		lastModified: scheduledItems.find((item) => item.shouldInclude)?.replayDateText,
		xml: ensureXmlDeclaration(ensureAtomSelfLink(rewrittenXml, feedUrl)),
	};
}

function scheduleItems(
	items: ParsedItem[],
	config: ReplayFeedConfig,
	now: Date,
	diagnostics: string[],
): ScheduledItem[] {
	const useSourceDates = items.every((item) => item.parsedDateMs !== null);
	if (!useSourceDates) {
		diagnostics.push('Some episodes are missing usable publish dates; falling back to feed order.');
		logDiagnostic('warn', 'feed_order_fallback', {
			missingDateCount: items.filter((item) => item.parsedDateMs === null).length,
			totalItems: items.length,
		});
	}

	const chronology = useSourceDates
		? [...items].sort((left, right) => {
				return (
					(left.parsedDateMs ?? 0) - (right.parsedDateMs ?? 0) ||
					left.index - right.index
				);
			})
		: [...items];

	const replayDateByIndex = new Map<number, { replayDateMs: number; replayDateText: string }>();
	const alignedStartDate = alignStartDate(config.startDate, config.releaseWeekday, config.cadenceUnit);

	for (const [orderIndex, item] of chronology.entries()) {
		const releaseDate = addScheduleSteps(alignedStartDate, orderIndex, config);
		const replayDateMs = zonedDateTimeToUtc(releaseDate, config.releaseTime, config.timeZone);
		replayDateByIndex.set(item.index, {
			replayDateMs,
			replayDateText: formatReplayDate(replayDateMs),
		});
	}

	return items.map((item) => {
		const replayDate = replayDateByIndex.get(item.index);
		if (!replayDate) {
			throw new Error('Internal scheduling error.');
		}

		return {
			...item,
			replayDateMs: replayDate.replayDateMs,
			replayDateText: replayDate.replayDateText,
			shouldInclude: replayDate.replayDateMs <= now.getTime(),
		};
	});
}

function rebuildFeedBody(
	body: string,
	matches: RegExpMatchArray[],
	items: ScheduledItem[],
	rewriteItem: (block: string, item: ScheduledItem, diagnostics: string[]) => string,
	diagnostics: string[],
): string {
	let cursor = 0;
	let rebuilt = '';

	for (const [index, match] of matches.entries()) {
		const start = match.index ?? 0;
		const originalBlock = match[0];
		const item = items[index];

		rebuilt += body.slice(cursor, start);
		if (item?.shouldInclude) {
			rebuilt += rewriteItem(originalBlock, item, diagnostics);
		}
		cursor = start + originalBlock.length;
	}

	return `${rebuilt}${body.slice(cursor)}`;
}

function rewriteRssChannelMetadata(
	head: string,
	config: ReplayFeedConfig,
	scheduledItems: ScheduledItem[],
	feedUrl?: string,
): string {
	const originalTitle = extractFirstTagText(head, ['title']) ?? 'Podcast';
	const originalDescription = extractFirstTagText(head, ['description']) ?? '';
	const context = buildTemplateContext(config, originalTitle, originalDescription);
	const nextTitle = applyTemplate(config.titleTemplate, context) || originalTitle;
	const nextDescription = applyTemplate(config.descriptionTemplate, context) || originalDescription;
	const latestVisibleItem = scheduledItems.find((item) => item.shouldInclude);

	let rewritten = upsertTextTag(head, 'title', nextTitle, {
		afterTag: null,
		beforeFirstItem: true,
	});
	rewritten = upsertTextTag(rewritten, 'description', nextDescription, {
		afterTag: 'title',
		beforeFirstItem: true,
	});
	if (latestVisibleItem) {
		rewritten = upsertTextTag(rewritten, 'pubDate', latestVisibleItem.replayDateText, {
			afterTag: 'link',
			beforeFirstItem: true,
		});
		rewritten = upsertTextTag(rewritten, 'lastBuildDate', latestVisibleItem.replayDateText, {
			afterTag: 'pubDate',
			beforeFirstItem: true,
		});
	}
	if (feedUrl) {
		rewritten = upsertAtomSelfLink(rewritten, feedUrl);
	}
	return rewritten;
}

function rewriteAtomChannelMetadata(
	head: string,
	config: ReplayFeedConfig,
	scheduledItems: ScheduledItem[],
	feedUrl?: string,
): string {
	const originalTitle = extractFirstTagText(head, ['title']) ?? 'Podcast';
	const originalDescription = extractFirstTagText(head, ['subtitle']) ?? '';
	const context = buildTemplateContext(config, originalTitle, originalDescription);
	const nextTitle = applyTemplate(config.titleTemplate, context) || originalTitle;
	const nextDescription = applyTemplate(config.descriptionTemplate, context) || originalDescription;
	const latestVisibleItem = scheduledItems.find((item) => item.shouldInclude);

	let rewritten = upsertTextTag(head, 'title', nextTitle, {
		afterTag: null,
		beforeFirstItem: true,
	});
	rewritten = upsertTextTag(rewritten, 'subtitle', nextDescription, {
		afterTag: 'title',
		beforeFirstItem: true,
	});
	if (latestVisibleItem) {
		rewritten = upsertTextTag(rewritten, 'updated', formatAtomDate(latestVisibleItem.replayDateMs), {
			afterTag: 'subtitle',
			beforeFirstItem: true,
		});
	}
	if (feedUrl) {
		rewritten = upsertAtomSelfLink(rewritten, feedUrl);
	}
	return rewritten;
}

function rewriteRssItem(block: string, item: ScheduledItem, diagnostics: string[]): string {
	let rewritten = replaceOrInsertDateTag(block, ['pubDate', 'dc:date'], item.replayDateText, 'pubDate');
	const noteText = buildOriginalReleaseNote(item.originalDateText, item.parsedDateMs);
	const withNote = injectEpisodeNote(rewritten, noteText, [
		'content:encoded',
		'description',
		'summary',
		'content',
	]);
	if (withNote.changed) {
		return withNote.block;
	}

	diagnostics.push(`Skipped description note injection for RSS item ${item.index + 1}; no supported description field found.`);
	logDiagnostic('warn', 'missing_note_target', {
		feedKind: 'rss',
		itemIndex: item.index,
	});
	return rewritten;
}

function rewriteAtomEntry(block: string, item: ScheduledItem, diagnostics: string[]): string {
	const atomDate = formatAtomDate(item.replayDateMs);
	let rewritten = replaceOrInsertDateTag(block, ['updated'], atomDate, 'updated');
	rewritten = replaceOrInsertDateTag(rewritten, ['published'], atomDate, 'published');

	const noteText = buildOriginalReleaseNote(item.originalDateText, item.parsedDateMs);
	const withNote = injectEpisodeNote(rewritten, noteText, [
		'content',
		'summary',
		'description',
	]);
	if (withNote.changed) {
		return withNote.block;
	}

	diagnostics.push(`Skipped description note injection for Atom entry ${item.index + 1}; no supported content field found.`);
	logDiagnostic('warn', 'missing_note_target', {
		feedKind: 'atom',
		itemIndex: item.index,
	});
	return rewritten;
}

function parseRssItem(block: string, index: number): ParsedItem {
	const originalDateText =
		extractFirstTagText(block, ['pubDate', 'dc:date', 'published', 'updated']) ?? null;
	return {
		block,
		index,
		originalDateText,
		parsedDateMs: parseDateValue(originalDateText),
	};
}

function parseAtomEntry(block: string, index: number): ParsedItem {
	const originalDateText =
		extractFirstTagText(block, ['published', 'updated', 'pubDate', 'dc:date']) ?? null;
	return {
		block,
		index,
		originalDateText,
		parsedDateMs: parseDateValue(originalDateText),
	};
}

function buildTemplateContext(
	config: ReplayFeedConfig,
	title: string,
	description: string,
): ChannelTemplateContext {
	return {
		cadenceCount: config.cadenceCount,
		cadenceUnit: config.cadenceUnit,
		description,
		releaseTime: config.releaseTime,
		releaseWeekday: config.releaseWeekday,
		source: config.source,
		startDate: config.startDate,
		timeZone: config.timeZone,
		title,
	};
}

function applyTemplate(template: string, context: ChannelTemplateContext): string {
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: keyof ChannelTemplateContext) => {
		const value = context[key];
		return value === undefined || value === null ? '' : String(value);
	});
}

function injectEpisodeNote(
	block: string,
	noteText: string,
	tagNames: string[],
): { block: string; changed: boolean } {
	for (const tagName of tagNames) {
		const regex = createTagRegex(tagName);
		const match = block.match(regex);
		if (!match) {
			continue;
		}

		const [, attrs = '', inner = ''] = match;
		const replacementInner = injectIntoExistingContent(inner, noteText);
		return {
			block: block.replace(regex, () => `<${tagName}${attrs}>${replacementInner}</${tagName}>`),
			changed: true,
		};
	}

	return { block, changed: false };
}

function injectIntoExistingContent(inner: string, noteText: string): string {
	const trimmed = inner.trim();
	const noteHtml = `<p><strong>Originally released:</strong> ${escapeHtml(noteText)}</p>`;
	if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
		const cdataBody = trimmed.slice(9, -3);
		const nextBody = looksLikeMarkup(cdataBody) ? `${noteHtml}\n${cdataBody}` : `${escapeHtml(noteText)}\n\n${cdataBody}`;
		return `<![CDATA[${nextBody}]]>`;
	}

	if (looksLikeMarkup(inner)) {
		return `${noteHtml}\n${inner}`;
	}

	return `${escapeXml(`Originally released: ${noteText}\n\n`)}${inner}`;
}

function replaceOrInsertDateTag(
	block: string,
	tagNames: string[],
	value: string,
	fallbackTagName: string,
): string {
	for (const tagName of tagNames) {
		const regex = createTagRegex(tagName);
		const match = block.match(regex);
		if (!match) {
			continue;
		}

		const [, attrs = '', inner = ''] = match;
		const replacementValue = wrapContentLikeExisting(inner, value);
		return block.replace(regex, () => `<${tagName}${attrs}>${replacementValue}</${tagName}>`);
	}

	const snippet = `<${fallbackTagName}>${escapeXml(value)}</${fallbackTagName}>`;
	const withTitleInsert = insertTagAfterFirstMatch(block, 'title', snippet);
	if (withTitleInsert !== block) {
		return withTitleInsert;
	}

	return insertAfterOpeningTag(block, snippet);
}

function upsertTextTag(
	block: string,
	tagName: string,
	value: string,
	options: { afterTag: string | null; beforeFirstItem: boolean },
): string {
	const regex = createTagRegex(tagName);
	const match = block.match(regex);
	if (match) {
		const [, attrs = '', inner = ''] = match;
		return block.replace(regex, () => `<${tagName}${attrs}>${wrapContentLikeExisting(inner, value)}</${tagName}>`);
	}

	const snippet = `<${tagName}>${escapeXml(value)}</${tagName}>`;
	if (options.afterTag) {
		const inserted = insertTagAfterFirstMatch(block, options.afterTag, snippet);
		if (inserted !== block) {
			return inserted;
		}
	}

	return insertAfterOpeningTag(block, snippet);
}

function wrapContentLikeExisting(existingInner: string, nextValue: string): string {
	const trimmed = existingInner.trim();
	if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
		return `<![CDATA[${nextValue}]]>`;
	}
	return escapeXml(nextValue);
}

function insertTagAfterFirstMatch(block: string, tagName: string, snippet: string): string {
	const regex = createTagRegex(tagName);
	const match = block.match(regex);
	if (!match || match.index === undefined) {
		return block;
	}

	const fullMatch = match[0];
	const insertAt = match.index + fullMatch.length;
	return `${block.slice(0, insertAt)}\n${snippet}${block.slice(insertAt)}`;
}

function insertAfterOpeningTag(block: string, snippet: string): string {
	const openMatch = block.match(/^<([A-Za-z_:][\w:.-]*)(\b[^>]*)>/);
	if (!openMatch) {
		return block;
	}

	const insertAt = openMatch[0].length;
	return `${block.slice(0, insertAt)}\n${snippet}${block.slice(insertAt)}`;
}

function upsertAtomSelfLink(block: string, feedUrl: string): string {
	const normalizedFeedUrl = escapeXml(feedUrl);
	const atomSelfRegex =
		/<atom:link\b[^>]*\brel=(["'])self\1[^>]*\/?>|<atom:link\b[^>]*\bhref=(["'])[^"']+\2[^>]*\brel=(["'])self\3[^>]*\/?>/i;
	const selfLink = `<atom:link href="${normalizedFeedUrl}" rel="self" type="application/rss+xml" />`;
	if (atomSelfRegex.test(block)) {
		return block.replace(atomSelfRegex, selfLink);
	}

	return insertAfterOpeningTag(block, selfLink);
}

function ensureXmlDeclaration(xml: string): string {
	if (/^\s*<\?xml\b/i.test(xml)) {
		return xml;
	}

	return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

function ensureRssSelfLink(xml: string, feedUrl?: string): string {
	if (!feedUrl) {
		return xml;
	}

	let nextXml = xml;
	if (!/\bxmlns:atom="/i.test(nextXml)) {
		nextXml = nextXml.replace(
			/<rss\b([^>]*)>/i,
			`<rss$1 xmlns:atom="http://www.w3.org/2005/Atom">`,
		);
	}
	if (/<atom:link\b[^>]*\brel=(["'])self\1/i.test(nextXml)) {
		return nextXml;
	}

	return nextXml.replace(
		/<channel\b[^>]*>/i,
		(match) =>
			`${match}\n<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
	);
}

function ensureAtomSelfLink(xml: string, feedUrl?: string): string {
	if (!feedUrl) {
		return xml;
	}
	if (/<link\b[^>]*\brel=(["'])self\1/i.test(xml)) {
		return xml.replace(
			/<link\b[^>]*\brel=(["'])self\1[^>]*\/?>/i,
			`<link href="${escapeXml(feedUrl)}" rel="self" />`,
		);
	}

	return xml.replace(
		/<feed\b[^>]*>/i,
		(match) => `${match}\n<link href="${escapeXml(feedUrl)}" rel="self" />`,
	);
}

function extractFirstTagText(block: string, tagNames: string[]): string | null {
	for (const tagName of tagNames) {
		const regex = createTagRegex(tagName);
		const match = block.match(regex);
		if (!match) {
			continue;
		}

		return normalizeXmlText(match[2] ?? '');
	}

	return null;
}

function createTagRegex(tagName: string): RegExp {
	return new RegExp(`<${escapeRegExp(tagName)}(\\b[^>]*)>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, 'i');
}

function normalizeXmlText(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
		return trimmed.slice(9, -3).trim();
	}
	return decodeXmlEntities(trimmed);
}

function decodeXmlEntities(value: string): string {
	return value
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&amp;', '&');
}

function buildOriginalReleaseNote(originalDateText: string | null, parsedDateMs: number | null): string {
	if (parsedDateMs !== null) {
		return formatOriginalReleaseDate(parsedDateMs);
	}
	if (originalDateText) {
		return originalDateText;
	}
	return 'Original release date unavailable';
}

function parseDateValue(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function alignStartDate(
	startDate: string,
	releaseWeekday: ReleaseWeekday,
	cadenceUnit: CadenceUnit,
): string {
	if (cadenceUnit !== 'weeks') {
		return startDate;
	}

	const date = parseIsoDate(startDate);
	const delta = (WEEKDAY_INDEX[releaseWeekday] - date.getUTCDay() + 7) % 7;
	date.setUTCDate(date.getUTCDate() + delta);
	return formatIsoDate(date);
}

function addScheduleSteps(startDate: string, offset: number, config: ReplayFeedConfig): string {
	const daysPerStep = config.cadenceUnit === 'days' ? config.cadenceCount : config.cadenceCount * 7;
	const date = parseIsoDate(startDate);
	date.setUTCDate(date.getUTCDate() + offset * daysPerStep);
	return formatIsoDate(date);
}

function parseIsoDate(value: string): Date {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		throw new Error(`Invalid date: ${value}`);
	}

	return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatIsoDate(date: Date): string {
	return [
		date.getUTCFullYear().toString().padStart(4, '0'),
		(date.getUTCMonth() + 1).toString().padStart(2, '0'),
		date.getUTCDate().toString().padStart(2, '0'),
	].join('-');
}

function zonedDateTimeToUtc(date: string, time: string, timeZone: string): number {
	const [year, month, day] = date.split('-').map(Number);
	const [hour, minute] = time.split(':').map(Number);
	const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
	const offset = getTimeZoneOffset(utcGuess, timeZone);
	return utcGuess - offset;
}

function getTimeZoneOffset(timestamp: number, timeZone: string): number {
	const formatter = new Intl.DateTimeFormat('en-US', {
		hour12: false,
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	const parts = formatter.formatToParts(new Date(timestamp));
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const localAsUtc = Date.UTC(
		Number(values.year),
		Number(values.month) - 1,
		Number(values.day),
		Number(values.hour),
		Number(values.minute),
		Number(values.second),
	);

	return localAsUtc - timestamp;
}

function formatReplayDate(timestamp: number): string {
	return new Date(timestamp).toUTCString();
}

function formatAtomDate(timestamp: number): string {
	return new Date(timestamp).toISOString();
}

function formatOriginalReleaseDate(timestamp: number): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'long',
		timeZone: 'UTC',
	}).format(timestamp);
}

function looksLikeRss(xml: string): boolean {
	return /<rss\b/i.test(xml) || /<channel\b/i.test(xml);
}

function looksLikeAtom(xml: string): boolean {
	return /<feed\b/i.test(xml) && /<entry\b/i.test(xml);
}

function looksLikeMarkup(value: string): boolean {
	return /<([A-Za-z][\w:-]*)(\s|>)/.test(value);
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
	const contentLength = response.headers.get('content-length');
	if (contentLength) {
		const bytes = Number(contentLength);
		if (Number.isFinite(bytes) && bytes > maxBytes) {
			throw new Error(`Source feed is too large (${bytes} bytes).`);
		}
	}

	if (!response.body) {
		return await response.text();
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let totalBytes = 0;
	let output = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		totalBytes += value.byteLength;
		if (totalBytes > maxBytes) {
			throw new Error(`Source feed exceeded the ${maxBytes} byte limit.`);
		}

		output += decoder.decode(value, { stream: true });
	}

	output += decoder.decode();
	return output;
}

function logDiagnostic(level: 'warn' | 'error', code: string, details: Record<string, unknown>): void {
	const payload = JSON.stringify({
		code,
		details,
		level,
		scope: 'rewindpodcast',
	});

	if (level === 'error') {
		console.error(payload);
		return;
	}

	console.warn(payload);
}

function readUrlParam(value: string | undefined, name: string): string {
	const nextValue = value?.trim();
	if (!nextValue) {
		throw new Error(`Missing required setting "${name}".`);
	}

	let parsed: URL;
	try {
		parsed = new URL(nextValue);
	} catch {
		throw new Error(`Setting "${name}" must be a valid URL.`);
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		throw new Error(`Setting "${name}" must use http or https.`);
	}

	return parsed.toString();
}

function readDateParam(value: string | undefined, name: string): string {
	const nextValue = value?.trim();
	if (!nextValue || !/^\d{4}-\d{2}-\d{2}$/.test(nextValue)) {
		throw new Error(`Setting "${name}" must use YYYY-MM-DD format.`);
	}

	return nextValue;
}

function readPositiveInteger(value: string, name: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		throw new Error(`Setting "${name}" must be a positive integer.`);
	}
	return parsed;
}

function readCadenceUnit(value: string): CadenceUnit {
	if (value === 'days' || value === 'weeks') {
		return value;
	}
	throw new Error('Setting "cadenceUnit" must be "days" or "weeks".');
}

function readWeekday(value: string): ReleaseWeekday {
	if (value in WEEKDAY_INDEX) {
		return value as ReleaseWeekday;
	}
	throw new Error('Setting "releaseWeekday" must be a weekday name.');
}

function readTimeParam(value: string, name: string): string {
	if (!/^\d{2}:\d{2}$/.test(value)) {
		throw new Error(`Setting "${name}" must use HH:MM format.`);
	}

	const [hours, minutes] = value.split(':').map(Number);
	if (hours > 23 || minutes > 59) {
		throw new Error(`Setting "${name}" must use a valid 24-hour time.`);
	}

	return value;
}

function readTimeZoneParam(value: string): string {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
		return value;
	} catch {
		throw new Error('Setting "timeZone" must be a valid IANA time zone.');
	}
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function escapeHtml(value: string): string {
	return escapeXml(value);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodeBase64Url(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padding = '='.repeat((4 - (base64.length % 4 || 4)) % 4);
	const binary = atob(`${base64}${padding}`);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
