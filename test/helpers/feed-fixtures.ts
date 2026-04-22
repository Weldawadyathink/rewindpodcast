export const RSS_SOURCE_FEED = `
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Source Podcast</title>
    <link>https://source.example.com/show</link>
    <description>The original feed description.</description>
    <item>
      <title>Episode 3</title>
      <description>Episode 3 fallback.</description>
      <content:encoded><![CDATA[<p>Episode 3 full notes.</p>]]></content:encoded>
      <enclosure url="https://cdn.example.com/e3.mp3" length="123" type="audio/mpeg" />
      <guid isPermaLink="false">ep-3</guid>
      <pubDate>Mon, 03 Jan 2022 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Episode 2</title>
      <description>Episode 2 fallback.</description>
      <enclosure url="https://cdn.example.com/e2.mp3" length="123" type="audio/mpeg" />
      <guid isPermaLink="false">ep-2</guid>
      <pubDate>Mon, 27 Dec 2021 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Episode 1</title>
      <description>Episode 1 fallback.</description>
      <enclosure url="https://cdn.example.com/e1.mp3" length="123" type="audio/mpeg" />
      <guid isPermaLink="false">ep-1</guid>
      <pubDate>Mon, 20 Dec 2021 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`.trim();

export const RSS_WITH_MISSING_PUBLISH_DATE = `
<rss version="2.0">
  <channel>
    <title>Missing Dates</title>
    <link>https://source.example.com/missing-dates</link>
    <description>Episodes without consistent dates.</description>
    <item>
      <title>Alpha</title>
      <description>Alpha description.</description>
      <guid>alpha</guid>
      <pubDate>Mon, 03 Jan 2022 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Beta</title>
      <description>Beta description.</description>
      <guid>beta</guid>
    </item>
    <item>
      <title>Gamma</title>
      <description>Gamma description.</description>
      <guid>gamma</guid>
      <pubDate>Mon, 20 Dec 2021 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`.trim();

export const RSS_WITH_MALFORMED_HTML_IN_CDATA = `
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Broken Markup Podcast</title>
    <link>https://source.example.com/broken-markup</link>
    <description>Broken markup lives inside CDATA.</description>
    <item>
      <title>Episode Broken</title>
      <description>Broken fallback.</description>
      <content:encoded><![CDATA[<p><strong>Broken markup</p><p>Still here.</p>]]></content:encoded>
      <guid>broken</guid>
      <pubDate>Mon, 03 Jan 2022 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`.trim();

export const RSS_OLDEST_FIRST_SOURCE_FEED = `
<rss version="2.0">
  <channel>
    <title>Chronological Podcast</title>
    <link>https://source.example.com/chronological</link>
    <description>Oldest episodes come first.</description>
    <item>
      <title>Episode 1</title>
      <description>Episode 1 fallback.</description>
      <guid>chron-1</guid>
      <pubDate>Mon, 20 Dec 2021 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Episode 2</title>
      <description>Episode 2 fallback.</description>
      <guid>chron-2</guid>
      <pubDate>Mon, 27 Dec 2021 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Episode 3</title>
      <description>Episode 3 fallback.</description>
      <guid>chron-3</guid>
      <pubDate>Mon, 03 Jan 2022 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`.trim();

export const RSS_WITH_PLAIN_TEXT_CDATA = `
<rss version="2.0">
  <channel>
    <title>Plain Text CDATA Podcast</title>
    <link>https://source.example.com/plain-text-cdata</link>
    <description>Plain text lives in CDATA blocks.</description>
    <item>
      <title>Episode Plain</title>
      <description><![CDATA[Plain text body only.]]></description>
      <guid>plain-cdata</guid>
      <pubDate>Mon, 03 Jan 2022 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`.trim();

export const ATOM_SOURCE_FEED = `
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Source Podcast</title>
  <subtitle>Atom feed description.</subtitle>
  <link href="https://source.example.com/atom" rel="alternate" />
  <entry>
    <title>Entry 3</title>
    <id>tag:source.example.com,2022:3</id>
    <updated>2022-01-03T09:00:00.000Z</updated>
    <published>2022-01-03T09:00:00.000Z</published>
    <content type="html"><![CDATA[<p>Entry 3 full notes.</p>]]></content>
    <summary>Entry 3 summary.</summary>
  </entry>
  <entry>
    <title>Entry 2</title>
    <id>tag:source.example.com,2021:2</id>
    <updated>2021-12-27T09:00:00.000Z</updated>
    <published>2021-12-27T09:00:00.000Z</published>
    <summary>Entry 2 summary.</summary>
  </entry>
  <entry>
    <title>Entry 1</title>
    <id>tag:source.example.com,2021:1</id>
    <updated>2021-12-20T09:00:00.000Z</updated>
    <published>2021-12-20T09:00:00.000Z</published>
    <summary>Entry 1 summary.</summary>
  </entry>
</feed>
`.trim();

export const RSS_WITHOUT_CHANNEL = `
<rss version="2.0">
  <title>Missing channel</title>
</rss>
`.trim();

export const RSS_WITHOUT_ITEMS = `
<rss version="2.0">
  <channel>
    <title>No Items</title>
    <link>https://source.example.com/no-items</link>
    <description>No items are present.</description>
  </channel>
</rss>
`.trim();

export const UNSUPPORTED_XML_FEED = `
<document>
  <title>Not RSS or Atom</title>
</document>
`.trim();

export function createLatin1EncodedRssFeedBytes(): Uint8Array {
	const xml = `
<?xml version="1.0" encoding="ISO-8859-1"?>
<rss version="2.0">
  <channel>
    <title>Café Podcast</title>
    <link>https://source.example.com/latin1</link>
    <description>Résumé episodes.</description>
    <item>
      <title>Épisode 1</title>
      <description>Déjà vu.</description>
      <guid>latin1-1</guid>
      <pubDate>Mon, 03 Jan 2022 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`.trim();
	return Uint8Array.from([...xml].map((character) => character.charCodeAt(0)));
}
