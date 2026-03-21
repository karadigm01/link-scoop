import { describe, expect, it } from 'vitest';
import { buildDownloadFilename, shouldHandleSelectAllShortcut } from '../src/extension/results/helpers.js';

describe('results helpers', () => {
  it('builds a base filename when no filters are active', () => {
    expect(buildDownloadFilename('Project Links', {})).toBe('project-links-links.txt');
  });

  it('appends one active filter to the filename', () => {
    expect(buildDownloadFilename('Wikipedia The Free Encyclopedia', { urlIncludePattern: 'github' })).toBe(
      'wikipedia-the-free-encyclopedia-links-include-github.txt'
    );
  });

  it('appends multiple filters and keeps the filename under 120 characters', () => {
    const filename = buildDownloadFilename(
      'An Extremely Long Page Title That Should Be Truncated Before The Filter Suffixes Are Lost',
      {
        urlIncludePattern: 'wiki',
        urlExcludePattern: 'Special:',
        textIncludePattern: 'featured articles',
        textExcludePattern: 'Main Page'
      }
    );

    expect(filename).toContain('-include-wiki');
    expect(filename).toContain('-exclude-special');
    expect(filename).toContain('-text-featured-articles');
    expect(filename).toContain('-textexcl-main-page');
    expect(filename.length).toBeLessThanOrEqual(120);
  });

  it('detects the select-all keyboard shortcut', () => {
    expect(shouldHandleSelectAllShortcut({ ctrlKey: true, metaKey: false, altKey: false, key: 'a' })).toBe(true);
    expect(shouldHandleSelectAllShortcut({ ctrlKey: false, metaKey: true, altKey: false, key: 'A' })).toBe(true);
    expect(shouldHandleSelectAllShortcut({ ctrlKey: true, metaKey: false, altKey: true, key: 'a' })).toBe(false);
  });

  it('falls back to default filename parts when title, filter values, or extension sanitize away', () => {
    expect(
      buildDownloadFilename('!!!', { urlIncludePattern: '!!!' }, '???')
    ).toBe('links-links-include-value.txt');
  });

  it('uses default title and extension when omitted', () => {
    expect(buildDownloadFilename(undefined, undefined, undefined)).toBe('links-links.txt');
  });

  it('uses fallback title and extension when null or empty values are passed explicitly', () => {
    expect(buildDownloadFilename(null, {}, null)).toBe('links-links.txt');
    expect(buildDownloadFilename('', {}, '')).toBe('links-links.txt');
  });

  it('rejects non-select-all shortcuts', () => {
    expect(shouldHandleSelectAllShortcut({ ctrlKey: false, metaKey: false, altKey: false, key: 'a' })).toBe(false);
    expect(shouldHandleSelectAllShortcut({ ctrlKey: true, metaKey: false, altKey: false, key: 'b' })).toBe(false);
  });
});
