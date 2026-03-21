import { describe, expect, it } from 'vitest';
import {
  cleanLinkText,
  deduplicateEntries,
  extractRedirectTargets,
  extractLinksFromSnapshot,
  filterEntries,
  formatEntriesAsCsv,
  formatEntriesAsPlainText,
  formatUrl,
  getVisibleEntries,
  resolveHref,
  sortEntries,
  snapshotFromDocument
} from '../src/extension/lib/link-processing.js';
import { JSDOM } from 'jsdom';

describe('link-processing', () => {
  it('normalizes whitespace in link text', () => {
    expect(cleanLinkText('  Hello\n\tworld   again  ')).toBe('Hello world again');
  });

  describe('resolveHref', () => {
    it('passes through supported non-http protocols and skips disallowed ones', () => {
      expect(resolveHref('magnet:?xt=urn:btih:abc123', 'https://example.com')).toBe('magnet:?xt=urn:btih:abc123');
      expect(resolveHref('mailto:user@example.com', 'https://example.com')).toBe('mailto:user@example.com');
      expect(resolveHref('ftp://files.example.com/doc.pdf', 'https://example.com')).toBe('ftp://files.example.com/doc.pdf');
      expect(resolveHref('tel:+15551234567', 'https://example.com')).toBe('tel:+15551234567');

      expect(resolveHref('javascript:void(0)', 'https://example.com')).toBeNull();
      expect(resolveHref('data:text/html,hello', 'https://example.com')).toBeNull();
      expect(resolveHref('about:blank', 'https://example.com')).toBeNull();
    });

    it('returns null for empty hrefs and invalid base-url resolution failures', () => {
      expect(resolveHref('', 'https://example.com')).toBeNull();
      expect(resolveHref('/relative', 'not-a-valid-base')).toBeNull();
    });
  });

  it('preserves original DOM order by default', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://c.com', text: 'C' },
        { domIndex: 1, resolvedHref: 'https://a.com', text: 'A' },
        { domIndex: 2, resolvedHref: 'https://b.com', text: 'B' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, { sortMode: 'original' });

    expect(visible.lines).toEqual(['https://c.com/', 'https://a.com/', 'https://b.com/']);
  });

  it('sorts alphabetically when requested', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://c.com', text: 'C' },
        { domIndex: 1, resolvedHref: 'https://a.com', text: 'A' },
        { domIndex: 2, resolvedHref: 'https://b.com', text: 'B' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, { sortMode: 'alphabetical' });

    expect(visible.lines).toEqual(['https://a.com/', 'https://b.com/', 'https://c.com/']);
  });

  it('supports combined include and exclude URL filters', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://github.com/repo', text: 'Repo' },
        { domIndex: 1, resolvedHref: 'https://github.com/issues', text: 'Issues' },
        { domIndex: 2, resolvedHref: 'https://example.com', text: 'Example' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, {
      sortMode: 'original',
      urlIncludePattern: 'github',
      urlExcludePattern: 'issues'
    });

    expect(visible.lines).toEqual(['https://github.com/repo']);
  });

  it('matches any include-url term when multiple comma-separated terms are provided', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://shop.example.com/product/123', text: 'Product' },
        { domIndex: 1, resolvedHref: 'https://shop.example.com/dp/456', text: 'DP' },
        { domIndex: 2, resolvedHref: 'https://shop.example.com/help', text: 'Help' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, {
      sortMode: 'original',
      urlIncludePattern: 'product, dp'
    });

    expect(visible.lines).toEqual([
      'https://shop.example.com/product/123',
      'https://shop.example.com/dp/456'
    ]);
  });

  it('removes links matching any exclude-url term when multiple comma-separated terms are provided', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://example.com/product/1', text: 'Direct' },
        { domIndex: 1, resolvedHref: 'https://example.com/product/2?affiliate=abc', text: 'Affiliate' },
        { domIndex: 2, resolvedHref: 'https://example.com/advertisement/banner', text: 'Ad' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, {
      sortMode: 'original',
      urlExcludePattern: 'affiliate, advertisement'
    });

    expect(visible.lines).toEqual(['https://example.com/product/1']);
  });

  it('ignores empty comma terms gracefully in non-regex mode', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://example.com/product/1?affiliate=abc', text: 'Affiliate' },
        { domIndex: 1, resolvedHref: 'https://example.com/sponsored/2', text: 'Sponsored' },
        { domIndex: 2, resolvedHref: 'https://example.com/product/3', text: 'Direct' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, {
      sortMode: 'original',
      urlExcludePattern: ' affiliate,, sponsored, '
    });

    expect(visible.lines).toEqual(['https://example.com/product/3']);
  });

  it('treats comma-only non-regex filters as no matcher', () => {
    const visible = getVisibleEntries(
      [{ displayUrl: 'https://example.com/product/3', text: 'Direct', domIndex: 0, variantIndex: 0 }],
      {
        sortMode: 'original',
        urlIncludePattern: ', ,'
      }
    );

    expect(visible.lines).toEqual(['https://example.com/product/3']);
    expect(visible.errors).toEqual([]);
    expect(visible.hint).toBe('');
  });

  it('does not split commas when regex mode is enabled', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://example.com/affiliate/path', text: 'Affiliate' },
        { domIndex: 1, resolvedHref: 'https://example.com/path,with,comma', text: 'Comma Path' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, {
      sortMode: 'original',
      useRegex: true,
      urlIncludePattern: 'affiliate, path'
    });

    expect(visible.lines).toEqual([]);
    expect(visible.errors).toEqual([]);
  });

  it('filters by visible link text', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, resolvedHref: 'https://example.com/abc123', text: 'My Document' },
        { domIndex: 1, resolvedHref: 'https://example.com/xyz', text: 'Other' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, {
      sortMode: 'original',
      textIncludePattern: 'My Document'
    });

    expect(visible.lines).toEqual(['https://example.com/abc123']);
  });

  it('extracts magnet, mailto, ftp, tel, and redirect target URLs', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        { domIndex: 0, rawHref: 'magnet:?xt=urn:btih:abc123', text: 'Torrent' },
        { domIndex: 1, rawHref: 'mailto:test@example.com', text: 'Email' },
        { domIndex: 2, rawHref: 'ftp://files.example.com/doc.pdf', text: 'FTP File' },
        { domIndex: 3, rawHref: 'tel:+15551234567', text: 'Call Us' },
        { domIndex: 4, rawHref: 'https://example.com/redirect?url=https://target.com/page', text: 'Redirect' }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, { sortMode: 'original' });

    expect(visible.lines).toEqual([
      'magnet:?xt=urn:btih:abc123',
      'mailto:test@example.com',
      'ftp://files.example.com/doc.pdf',
      'tel:+15551234567',
      'https://example.com/redirect?url=https://target.com/page',
      'https://target.com/page'
    ]);
  });

  it('captures links present in the DOM at extraction time', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <a href="https://static.example">Static</a>
      <script></script>
    </body></html>`, { url: 'https://page.example/' });

    const anchor = dom.window.document.createElement('a');
    anchor.href = 'https://dynamic.com';
    anchor.textContent = 'Dynamic';
    dom.window.document.body.append(anchor);

    const snapshot = snapshotFromDocument(dom.window.document);
    const { entries } = extractLinksFromSnapshot(snapshot);
    const visible = getVisibleEntries(entries, { sortMode: 'original' });

    expect(visible.lines).toContain('https://dynamic.com/');
  });

  it('preserves encoded URLs by default and can optionally decode them', () => {
    const snapshot = {
      pageUrl: 'https://example.com',
      links: [
        {
          domIndex: 0,
          rawHref: 'https://example.com/path%20with%20spaces?q=hello%26world',
          text: 'Encoded'
        }
      ]
    };

    const { entries } = extractLinksFromSnapshot(snapshot);
    const rawVisible = getVisibleEntries(entries, { sortMode: 'original', decodeUrls: false });
    const decodedVisible = getVisibleEntries(entries, { sortMode: 'original', decodeUrls: true });

    expect(rawVisible.lines).toEqual(['https://example.com/path%20with%20spaces?q=hello%26world']);
    expect(decodedVisible.lines).toEqual(['https://example.com/path with spaces?q=hello%26world']);
  });

  it('formats plain text with one URL per line and no blank entries', () => {
    const text = formatEntriesAsPlainText([
      { displayUrl: 'https://example.com/one' },
      { displayUrl: 'https://example.com/two' },
      { displayUrl: 'https://example.com/three' }
    ]);

    expect(text).toBe('https://example.com/one\nhttps://example.com/two\nhttps://example.com/three');
    expect(text.split('\n')).toHaveLength(3);
  });

  it('surfaces redirect targets from query params and hash params without duplicates', () => {
    expect(
      extractRedirectTargets(
        'https://example.com/redirect?url=https%3A%2F%2Ftarget.example%2Fpage#next=https://target.example/page'
      )
    ).toEqual(['https://target.example/page']);
  });

  it('returns no redirect targets for invalid or skipped redirect candidates', () => {
    expect(extractRedirectTargets('not-a-valid-url')).toEqual([]);
    expect(extractRedirectTargets('https://example.com/redirect?url=javascript:void(0)')).toEqual([]);
  });

  it('surfaces decoded redirect targets and ignores candidates equal to the source URL', () => {
    expect(
      extractRedirectTargets(
        'https://example.com/redirect?target=%2Fdocs%2Fguide&url=https%3A%2F%2Fexample.com%2Fredirect%3Ftarget%3Dsame'
      )
    ).toEqual([
      'https://example.com/docs/guide',
      'https://example.com/redirect?target=same'
    ]);
  });

  it('normalizes undecodable redirect candidates consistently', () => {
    expect(
      extractRedirectTargets('https://example.com/redirect?url=%E0%A4%A&next=%')
    ).toEqual([
      'https://example.com/%EF%BF%BD%A',
      'https://example.com/%'
    ]);
  });

  it('skips malformed absolute redirect candidates that cannot be parsed', () => {
    expect(
      extractRedirectTargets('https://example.com/redirect?url=http://[invalid')
    ).toEqual([]);
  });

  it('deduplicates entries by display url and preserves first occurrence order', () => {
    expect(
      deduplicateEntries([
        { displayUrl: 'https://example.com/a', text: 'First A' },
        { displayUrl: 'https://example.com/a', text: 'Second A' },
        { displayUrl: 'https://example.com/b', text: 'B' }
      ])
    ).toEqual([
      { displayUrl: 'https://example.com/a', text: 'First A' },
      { displayUrl: 'https://example.com/b', text: 'B' }
    ]);
  });

  it('keeps original ordering for non-alphabetical sort modes', () => {
    expect(
      sortEntries(
        [
          { displayUrl: 'https://example.com/b', domIndex: 2, variantIndex: 0 },
          { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 1 },
          { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 0 }
        ],
        'original'
      )
    ).toEqual([
      { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 0 },
      { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 1 },
      { displayUrl: 'https://example.com/b', domIndex: 2, variantIndex: 0 }
    ]);
  });

  it('reports invalid regex filters and returns empty lines when nothing matches', () => {
    const visible = getVisibleEntries(
      [
        { displayUrl: 'https://example.com/a', text: 'Alpha', domIndex: 0, variantIndex: 0 },
        { displayUrl: 'https://example.com/b', text: 'Beta', domIndex: 1, variantIndex: 0 }
      ],
      {
        sortMode: 'original',
        useRegex: true,
        urlIncludePattern: '[',
        textExcludePattern: 'Alpha'
      }
    );

    expect(visible.errors).toEqual(['URL include regex is invalid.']);
    expect(visible.lines).toEqual(['https://example.com/b']);

    const noMatches = getVisibleEntries(
      [{ displayUrl: 'https://example.com/a', text: 'Alpha', domIndex: 0, variantIndex: 0 }],
      {
        sortMode: 'original',
        textIncludePattern: 'Gamma'
      }
    );

    expect(noMatches.lines).toEqual([]);
    expect(noMatches.text).toBe('');
  });

  it('returns an empty-state hint when the source entries are already empty', () => {
    const visible = getVisibleEntries([], { sortMode: 'original' });

    expect(visible.hint).toBe('No links were found on this page.');
    expect(visible.lines).toEqual([]);
  });

  it('names the active filters when they remove all visible links', () => {
    const visible = getVisibleEntries(
      [{ displayUrl: 'https://example.com/a', text: 'Alpha', domIndex: 0, variantIndex: 0 }],
      {
        sortMode: 'original',
        urlIncludePattern: 'docs',
        textExcludePattern: 'Alpha'
      }
    );

    expect(visible.hint).toBe('No links matched the active filters: URL include and Text exclude. Try Reset Filters.');
    expect(visible.lines).toEqual([]);
  });

  it('formats three active filters naturally in the empty-state hint', () => {
    const visible = getVisibleEntries(
      [{ displayUrl: 'https://example.com/a', text: 'Alpha', domIndex: 0, variantIndex: 0 }],
      {
        sortMode: 'original',
        urlIncludePattern: 'docs',
        urlExcludePattern: 'archive',
        textIncludePattern: 'Gamma'
      }
    );

    expect(visible.hint).toBe(
      'No links matched the active filters: URL include, URL exclude, and Text include. Try Reset Filters.'
    );
    expect(visible.lines).toEqual([]);
  });

  it('does not duplicate invalid regex errors in the empty-state hint', () => {
    const visible = getVisibleEntries(
      [{ displayUrl: 'https://example.com/a', text: 'Alpha', domIndex: 0, variantIndex: 0 }],
      {
        sortMode: 'original',
        useRegex: true,
        urlIncludePattern: '[',
        textIncludePattern: 'Gamma'
      }
    );

    expect(visible.errors).toEqual(['URL include regex is invalid.']);
    expect(visible.hint).toBe('No links matched the active filters: Text include. Try Reset Filters.');
    expect(visible.lines).toEqual([]);
  });

  it('returns an empty hint when visible entries remain after filtering', () => {
    const visible = getVisibleEntries(
      [{ displayUrl: 'https://example.com/a', text: 'Alpha', domIndex: 0, variantIndex: 0 }],
      {
        sortMode: 'original',
        textIncludePattern: 'Alpha'
      }
    );

    expect(visible.hint).toBe('');
    expect(visible.lines).toEqual(['https://example.com/a']);
  });

  it('reports invalid regex filters for exclude and text patterns while keeping entries', () => {
    const visible = filterEntries(
      [{ displayUrl: 'https://example.com/a', text: 'Alpha' }],
      {
        useRegex: true,
        urlExcludePattern: '[',
        textIncludePattern: '('
      }
    );

    expect(visible.errors).toEqual([
      'URL exclude regex is invalid.',
      'Text include regex is invalid.'
    ]);
    expect(visible.entries).toEqual([{ displayUrl: 'https://example.com/a', text: 'Alpha' }]);
  });

  it('handles missing display urls and text during filtering', () => {
    const visible = filterEntries(
      [{ displayUrl: null, text: null }, { displayUrl: 'https://example.com/a', text: 'Alpha' }],
      { urlIncludePattern: 'example.com' }
    );

    expect(visible.entries).toEqual([{ displayUrl: 'https://example.com/a', text: 'Alpha' }]);
    expect(visible.errors).toEqual([]);
  });

  it('reports invalid text-exclude regex filters while keeping entries', () => {
    const visible = filterEntries(
      [{ displayUrl: 'https://example.com/a', text: 'Alpha' }],
      {
        useRegex: true,
        textExcludePattern: '['
      }
    );

    expect(visible.errors).toEqual(['Text exclude regex is invalid.']);
    expect(visible.entries).toEqual([{ displayUrl: 'https://example.com/a', text: 'Alpha' }]);
  });

  it('falls back to snapshot url and default title when snapshot fields are missing or links are invalid', () => {
    expect(
      extractLinksFromSnapshot({
        url: 'https://fallback.example/base',
        links: [
          { href: '/valid', text: 'Valid' },
          { href: 'javascript:void(0)', text: 'Skipped' }
        ]
      })
    ).toEqual({
      pageUrl: 'https://fallback.example/base',
      title: '',
      entries: [
        {
          displayUrl: 'https://fallback.example/valid',
          text: 'Valid',
          domIndex: 0,
          variantIndex: 0,
          surfaced: false,
          sourceUrl: null
        }
      ]
    });

    expect(extractLinksFromSnapshot({ links: null })).toEqual({
      pageUrl: 'https://example.invalid/',
      title: '',
      entries: []
    });
  });

  it('falls back to an empty string when extracted link text is missing', () => {
    expect(
      extractLinksFromSnapshot({
        pageUrl: 'https://example.com',
        links: [{ resolvedHref: 'https://example.com/docs', text: null }]
      })
    ).toEqual({
      pageUrl: 'https://example.com',
      title: '',
      entries: [
        {
          displayUrl: 'https://example.com/docs',
          text: '',
          domIndex: 0,
          variantIndex: 0,
          surfaced: false,
          sourceUrl: null
        }
      ]
    });
  });

  it('captures a blank title from the document snapshot when no title exists', () => {
    const dom = new JSDOM('<!doctype html><html><body><a href="/docs">Docs</a></body></html>', {
      url: 'https://example.com/base'
    });

    expect(snapshotFromDocument(dom.window.document)).toEqual({
      pageUrl: 'https://example.com/base',
      title: '',
      links: [
        {
          domIndex: 0,
          rawHref: '/docs',
          resolvedHref: 'https://example.com/docs',
          text: 'Docs'
        }
      ]
    });
  });

  it('falls back to empty href and text values in document snapshots', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/base'
    });

    const fakeAnchor = {
      getAttribute: () => null,
      href: 'https://example.com/fallback',
      textContent: null
    };
    dom.window.document.querySelectorAll = () => [fakeAnchor];

    expect(snapshotFromDocument(dom.window.document)).toEqual({
      pageUrl: 'https://example.com/base',
      title: '',
      links: [
        {
          domIndex: 0,
          rawHref: '',
          resolvedHref: 'https://example.com/fallback',
          text: ''
        }
      ]
    });
  });

  it('uses tie-breaker branches for both alphabetical and original sorting', () => {
    expect(
      sortEntries(
        [
          { displayUrl: 'https://example.com/a', domIndex: 2, variantIndex: 1 },
          { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 0 },
          { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 1 }
        ],
        'alphabetical'
      )
    ).toEqual([
      { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 0 },
      { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 1 },
      { displayUrl: 'https://example.com/a', domIndex: 2, variantIndex: 1 }
    ]);

    expect(
      sortEntries(
        [
          { displayUrl: 'https://example.com/b', domIndex: 1, variantIndex: 0 },
          { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 0 }
        ],
        'original'
      )
    ).toEqual([
      { displayUrl: 'https://example.com/a', domIndex: 1, variantIndex: 0 },
      { displayUrl: 'https://example.com/b', domIndex: 1, variantIndex: 0 }
    ]);
  });

  it('returns original url when decoding is disabled or decodeURI throws', () => {
    expect(formatUrl('https://example.com/%E2%82%AC', false)).toBe('https://example.com/%E2%82%AC');
    expect(formatUrl('https://example.com/%E0%A4%A', true)).toBe('https://example.com/%E0%A4%A');
  });

  it('formats visible entries as CSV with a header row', () => {
    expect(
      formatEntriesAsCsv([
        {
          displayUrl: 'https://example.com/page',
          text: 'Example Page',
          surfaced: false,
          sourceUrl: null
        }
      ])
    ).toBe('url,link_text,is_redirect,redirect_source\nhttps://example.com/page,Example Page,false,');
  });

  it('escapes CSV values containing commas, quotes, and newlines', () => {
    expect(
      formatEntriesAsCsv([
        {
          displayUrl: 'https://example.com/path?label=a,b',
          text: 'A "quoted", title\nwith newline',
          surfaced: false,
          sourceUrl: null
        }
      ])
    ).toBe(
      'url,link_text,is_redirect,redirect_source\n"https://example.com/path?label=a,b","A ""quoted"", title\nwith newline",false,'
    );
  });

  it('marks surfaced redirect entries in CSV output', () => {
    expect(
      formatEntriesAsCsv(
        [
          {
            displayUrl: 'https://target.com/real%20page',
            text: 'Target',
            surfaced: true,
            sourceUrl: 'https://example.com/redirect?url=https%3A%2F%2Ftarget.com%2Freal%20page'
          }
        ],
        { decodeUrls: true }
      )
    ).toBe(
      'url,link_text,is_redirect,redirect_source\nhttps://target.com/real page,Target,true,https://example.com/redirect?url=https%3A%2F%2Ftarget.com%2Freal page'
    );
  });

  it('falls back to empty CSV fields for null text and redirect sources', () => {
    expect(
      formatEntriesAsCsv([
        {
          displayUrl: 'https://example.com/page',
          text: null,
          surfaced: true,
          sourceUrl: null
        }
      ])
    ).toBe('url,link_text,is_redirect,redirect_source\nhttps://example.com/page,,true,');
  });

  it('falls back to empty CSV fields for undefined text values', () => {
    expect(
      formatEntriesAsCsv([
        {
          displayUrl: 'https://example.com/page',
          text: undefined,
          surfaced: false,
          sourceUrl: null
        }
      ])
    ).toBe('url,link_text,is_redirect,redirect_source\nhttps://example.com/page,,false,');
  });

  it('falls back to an empty CSV url field when the display url is missing', () => {
    expect(
      formatEntriesAsCsv([
        {
          displayUrl: undefined,
          text: 'Missing URL',
          surfaced: false,
          sourceUrl: null
        }
      ])
    ).toBe('url,link_text,is_redirect,redirect_source\n,Missing URL,false,');
  });
});
