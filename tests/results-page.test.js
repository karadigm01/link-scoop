// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/extension/lib/link-processing.js', () => ({
  formatEntriesAsCsv: vi.fn(),
  getVisibleEntries: vi.fn()
}));

vi.mock('../src/extension/lib/results-store.js', () => ({
  getResultRecord: vi.fn()
}));

vi.mock('../src/extension/lib/settings.js', () => ({
  THEME_MODES: {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark'
  },
  getSettings: vi.fn(),
  saveSettings: vi.fn()
}));

vi.mock('../src/extension/results/helpers.js', () => ({
  buildDownloadFilename: vi.fn(() => 'saved-links.txt'),
  shouldHandleSelectAllShortcut: vi.fn(event => (event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'a')
}));

import { getVisibleEntries } from '../src/extension/lib/link-processing.js';
import { formatEntriesAsCsv } from '../src/extension/lib/link-processing.js';
import { getResultRecord } from '../src/extension/lib/results-store.js';
import { getSettings, saveSettings } from '../src/extension/lib/settings.js';
import { buildDownloadFilename, shouldHandleSelectAllShortcut } from '../src/extension/results/helpers.js';

function renderResultsDom() {
  document.body.innerHTML = `
    <main class="layout">
      <section class="panel hero">
        <div>
          <div class="heroTopRow">
            <p class="eyebrow">Link Scoop</p>
            <button id="quickStartButton" class="inlineButton" type="button">💡 Quick Start</button>
            <button id="themeCycleButton" class="themeCycleButton" type="button">Theme: System</button>
          </div>
          <h1>Extracted links</h1>
          <p id="summaryText" class="summary">Preparing results…</p>
        </div>
        <div class="buttonRow compact">
          <button id="refreshButton" type="button">Refresh Scan</button>
          <button id="copyButton" class="primary" type="button">Copy All</button>
          <button id="downloadButton" type="button">Download as TXT</button>
          <button id="downloadCsvButton" type="button">Download as CSV</button>
        </div>
      </section>

      <section class="panel controls">
        <div class="controlGroup">
          <label class="choice"><input type="radio" name="sortMode" value="original" /> <span>Original</span></label>
          <label class="choice"><input type="radio" name="sortMode" value="alphabetical" /> <span>Alphabetical</span></label>
        </div>
        <div class="controlGroup grid">
          <button id="resetFiltersButton" type="button">Reset Filters</button>
          <input id="urlIncludePattern" type="text" />
          <input id="urlExcludePattern" type="text" />
          <input id="textIncludePattern" type="text" />
          <input id="textExcludePattern" type="text" />
          <input id="useRegex" type="checkbox" />
          <input id="decodeUrls" type="checkbox" />
        </div>
      </section>

      <section class="panel outputPanel">
        <p id="localFileBanner" class="infoNote" hidden>This page was loaded from a local file. Some links may appear as <code>file:///</code> paths — these were relative URLs on the original site that the browser resolved locally. They are correct for the saved page but won't match the live site's full URLs.</p>
        <div class="outputHeader">
          <p id="messageText" class="status"></p>
        </div>
        <textarea id="outputArea" readonly></textarea>
      </section>
    </main>
    <div id="themeToast" class="themeToast" hidden></div>
  `;
}

async function loadResultsModule() {
  vi.resetModules();
  await import('../src/extension/results/results.js');
  await Promise.resolve();
  await Promise.resolve();
}

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('results page', () => {
  let clipboardWriteText;
  let sendMessage;
  let createObjectUrl;
  let revokeObjectUrl;
  let anchorClick;

  beforeEach(() => {
    vi.clearAllMocks();
    renderResultsDom();

    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    sendMessage = vi.fn().mockResolvedValue(undefined);
    createObjectUrl = vi.fn(() => 'blob:download');
    revokeObjectUrl = vi.fn();
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    window.history.replaceState({}, '', '?resultId=result-1');

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText }
    });

    globalThis.browser = {
      runtime: {
        sendMessage
      }
    };

    globalThis.URL.createObjectURL = createObjectUrl;
    globalThis.URL.revokeObjectURL = revokeObjectUrl;

    getSettings.mockResolvedValue({
      sortMode: 'alphabetical',
      themeMode: 'dark',
      urlIncludePattern: 'github',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });

    getResultRecord.mockResolvedValue({
      title: 'Example Page',
      pageUrl: 'https://example.com',
      entries: [{ displayUrl: 'https://github.com/repo' }]
    });

    getVisibleEntries.mockReturnValue({
      entries: [{ displayUrl: 'https://github.com/repo' }],
      errors: [],
      hint: '',
      text: 'https://github.com/repo',
      lines: ['https://github.com/repo']
    });
    formatEntriesAsCsv.mockReturnValue('url,link_text,is_redirect,redirect_source\nhttps://github.com/repo,Repo,false,');

    saveSettings.mockImplementation(async nextSettings => nextSettings);
  });

  afterEach(() => {
    anchorClick?.mockRestore();
    delete globalThis.browser;
  });

  it('loads saved results and renders the plain-text output', async () => {
    await loadResultsModule();

    expect(getSettings).toHaveBeenCalledOnce();
    expect(getResultRecord).toHaveBeenCalledWith('result-1');
    expect(document.getElementById('outputArea').value).toBe('https://github.com/repo');
    expect(document.getElementById('summaryText').textContent).toBe('1 links ready from Example Page.');
    expect(document.getElementById('messageText').textContent).toBe('1 clean lines ready for copy or export.');
    expect(document.querySelector('input[value="alphabetical"]').checked).toBe(true);
    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: Dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.getElementById('urlIncludePattern').value).toBe('github');
    expect(document.getElementById('localFileBanner').hidden).toBe(true);
  });

  it('shows the local-file banner for file pages and hides it for https pages', async () => {
    getResultRecord.mockResolvedValueOnce({
      title: 'Saved File',
      pageUrl: 'file:///home/j/example.html',
      entries: [{ displayUrl: 'file:///home/j/example.html#section' }]
    });
    getVisibleEntries.mockReturnValueOnce({
      entries: [{ displayUrl: 'file:///home/j/example.html#section' }],
      errors: [],
      hint: '',
      text: 'file:///home/j/example.html#section',
      lines: ['file:///home/j/example.html#section']
    });

    await loadResultsModule();

    expect(document.getElementById('localFileBanner').hidden).toBe(false);
    expect(document.getElementById('localFileBanner').textContent).toContain('This page was loaded from a local file.');

    vi.clearAllMocks();
    renderResultsDom();
    window.history.replaceState({}, '', '?resultId=result-1');

    getSettings.mockResolvedValue({
      sortMode: 'alphabetical',
      themeMode: 'dark',
      urlIncludePattern: 'github',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });
    getResultRecord.mockResolvedValue({
      title: 'Example Page',
      pageUrl: 'https://example.com',
      entries: [{ displayUrl: 'https://github.com/repo' }]
    });
    getVisibleEntries.mockReturnValue({
      entries: [{ displayUrl: 'https://github.com/repo' }],
      errors: [],
      hint: '',
      text: 'https://github.com/repo',
      lines: ['https://github.com/repo']
    });
    formatEntriesAsCsv.mockReturnValue('url,link_text,is_redirect,redirect_source\nhttps://github.com/repo,Repo,false,');
    saveSettings.mockImplementation(async nextSettings => nextSettings);

    await loadResultsModule();

    expect(document.getElementById('localFileBanner').hidden).toBe(true);
  });

  it('falls back to system labels, original sort, empty entries, and default download names', async () => {
    getSettings.mockResolvedValueOnce({
      sortMode: '',
      themeMode: '',
      urlIncludePattern: null,
      urlExcludePattern: null,
      textIncludePattern: null,
      textExcludePattern: null,
      useRegex: false,
      decodeUrls: false
    });
    getResultRecord.mockResolvedValueOnce({
      title: '',
      pageUrl: '',
      entries: undefined
    });
    getVisibleEntries.mockReturnValueOnce({
      entries: [],
      errors: [],
      hint: '',
      text: '',
      lines: []
    });

    await loadResultsModule();

    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: System');
    expect(getVisibleEntries).toHaveBeenCalledWith([], expect.any(Object));

    document.getElementById('themeCycleButton').click();
    await flushUi();
    expect(saveSettings).toHaveBeenLastCalledWith({
      sortMode: 'original',
      themeMode: 'light',
      urlIncludePattern: '',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });

    saveSettings.mockResolvedValueOnce({
      sortMode: 'original',
      themeMode: 'mystery',
      urlIncludePattern: '',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });
    document.getElementById('themeCycleButton').click();
    await flushUi();
    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: System');
    expect(document.getElementById('themeToast').textContent).toBe('System theme selected.');

    buildDownloadFilename.mockClear();
    document.getElementById('downloadButton').click();
    document.getElementById('downloadCsvButton').click();
    expect(buildDownloadFilename).toHaveBeenNthCalledWith(1, 'link-scoop', expect.any(Object), 'txt');
    expect(buildDownloadFilename).toHaveBeenNthCalledWith(2, 'link-scoop', expect.any(Object), 'csv');
  });

  it('copies all output to the clipboard and reports the number of copied links', async () => {
    vi.useFakeTimers();
    await loadResultsModule();

    document.getElementById('copyButton').click();
    await Promise.resolve();

    expect(clipboardWriteText).toHaveBeenCalledWith('https://github.com/repo');
    expect(document.getElementById('copyButton').textContent).toBe('Copied!');
    expect(document.getElementById('copyButton').classList.contains('toast-success')).toBe(true);
    expect(document.getElementById('messageText').textContent).toBe('Copied 1 links to the clipboard.');

    vi.advanceTimersByTime(2000);
    expect(document.getElementById('copyButton').textContent).toBe('Copy All');
    expect(document.getElementById('copyButton').classList.contains('toast-success')).toBe(false);
    vi.useRealTimers();
  });

  it('opens onboarding overview from the Quick Start button', async () => {
    await loadResultsModule();

    document.getElementById('quickStartButton').click();
    await flushUi();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'open-onboarding', section: 'overview' });
  });

  it('resets the previous copy toast timer when copy is clicked twice quickly', async () => {
    vi.useFakeTimers();
    await loadResultsModule();

    document.getElementById('copyButton').click();
    await Promise.resolve();
    vi.advanceTimersByTime(1000);

    document.getElementById('copyButton').click();
    await Promise.resolve();

    expect(document.getElementById('copyButton').textContent).toBe('Copied!');

    vi.advanceTimersByTime(1000);
    expect(document.getElementById('copyButton').textContent).toBe('Copied!');

    vi.advanceTimersByTime(1000);
    expect(document.getElementById('copyButton').textContent).toBe('Copy All');
    vi.useRealTimers();
  });

  it('refreshes the result set from the background runtime and rerenders', async () => {
    getResultRecord
      .mockResolvedValueOnce({
        title: 'Example Page',
        pageUrl: 'https://example.com',
        entries: [{ displayUrl: 'https://github.com/repo' }]
      })
      .mockResolvedValueOnce({
        title: 'Updated Page',
        pageUrl: 'https://example.com',
        entries: [{ displayUrl: 'https://github.com/new' }]
      });

    getVisibleEntries
      .mockReturnValueOnce({
        entries: [{ displayUrl: 'https://github.com/repo' }],
        errors: [],
        hint: '',
        text: 'https://github.com/repo',
        lines: ['https://github.com/repo']
      })
      .mockReturnValueOnce({
        entries: [{ displayUrl: 'https://github.com/new' }],
        errors: [],
        hint: '',
        text: 'https://github.com/new',
        lines: ['https://github.com/new']
      });

    await loadResultsModule();

    document.getElementById('refreshButton').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'refresh-result', resultId: 'result-1' });
    expect(document.getElementById('outputArea').value).toBe('https://github.com/new');
    expect(document.getElementById('summaryText').textContent).toBe('1 links ready from Updated Page.');
    expect(document.getElementById('refreshButton').disabled).toBe(false);
  });

  it('persists changed filters and rerenders the output', async () => {
    saveSettings.mockResolvedValue({
      sortMode: 'original',
      themeMode: 'light',
      urlIncludePattern: 'docs',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: true,
      decodeUrls: false
    });

    getVisibleEntries.mockImplementation((entries, settings) => {
      if (settings?.urlIncludePattern === 'docs') {
        return {
          entries: [{ displayUrl: 'https://docs.example.com' }],
          errors: ['URL include regex is invalid.'],
          hint: '',
          text: 'https://docs.example.com',
          lines: ['https://docs.example.com']
        };
      }

      return {
        entries: [{ displayUrl: 'https://github.com/repo' }],
        errors: [],
        hint: '',
        text: 'https://github.com/repo',
        lines: ['https://github.com/repo']
      };
    });

    await loadResultsModule();

    const includeField = document.getElementById('urlIncludePattern');
    includeField.value = 'docs';
    document.getElementById('useRegex').checked = true;
    document.querySelector('input[value="original"]').checked = true;
    includeField.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUi();

    expect(saveSettings).toHaveBeenCalledWith({
      sortMode: 'original',
      themeMode: 'dark',
      urlIncludePattern: 'docs',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: true,
      decodeUrls: false
    });
    expect(getVisibleEntries).toHaveBeenLastCalledWith(
      [{ displayUrl: 'https://github.com/repo' }],
      expect.objectContaining({
        sortMode: 'original',
        urlIncludePattern: 'docs',
        useRegex: true
      })
    );
    expect(document.getElementById('outputArea').value).toBe('https://docs.example.com');
    expect(document.getElementById('messageText').textContent).toBe('URL include regex is invalid.');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('cycles the theme from the header button and shows a 2-second popup', async () => {
    vi.useFakeTimers();
    saveSettings.mockResolvedValue({
      sortMode: 'alphabetical',
      themeMode: 'system',
      urlIncludePattern: 'github',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });

    await loadResultsModule();

    document.getElementById('themeCycleButton').click();
    await Promise.resolve();

    expect(saveSettings).toHaveBeenCalledWith({
      sortMode: 'alphabetical',
      themeMode: 'system',
      urlIncludePattern: 'github',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });
    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: System');
    expect(document.getElementById('themeToast').textContent).toBe('System theme selected.');
    expect(document.getElementById('themeToast').hidden).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(document.getElementById('themeToast').hidden).toBe(true);
    vi.useRealTimers();
  });

  it('resets only the filters, persists them, and rerenders output', async () => {
    getVisibleEntries.mockImplementation((entries, settings) => {
      if (settings?.urlIncludePattern === '') {
        return {
          entries: [{ displayUrl: 'https://github.com/repo' }],
          errors: [],
          hint: '',
          text: 'https://github.com/repo',
          lines: ['https://github.com/repo']
        };
      }

      return {
        entries: [],
        errors: [],
        hint: 'No links matched the active filters: URL include. Try Reset Filters.',
        text: '',
        lines: []
      };
    });

    await loadResultsModule();

    document.getElementById('resetFiltersButton').click();
    await flushUi();

    expect(saveSettings).toHaveBeenCalledWith({
      sortMode: 'alphabetical',
      themeMode: 'dark',
      urlIncludePattern: '',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });
    expect(document.querySelector('input[value="alphabetical"]').checked).toBe(true);
    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: Dark');
    expect(document.getElementById('urlIncludePattern').value).toBe('');
    expect(document.getElementById('urlExcludePattern').value).toBe('');
    expect(document.getElementById('textIncludePattern').value).toBe('');
    expect(document.getElementById('textExcludePattern').value).toBe('');
    expect(document.getElementById('useRegex').checked).toBe(false);
    expect(document.getElementById('decodeUrls').checked).toBe(false);
    expect(document.getElementById('outputArea').value).toBe('https://github.com/repo');
    expect(document.getElementById('messageText').textContent).toBe('1 clean lines ready for copy or export.');
    expect(getVisibleEntries).toHaveBeenLastCalledWith(
      [{ displayUrl: 'https://github.com/repo' }],
      expect.objectContaining({
        sortMode: 'alphabetical',
        themeMode: 'dark',
        urlIncludePattern: '',
        urlExcludePattern: '',
        textIncludePattern: '',
        textExcludePattern: '',
        useRegex: false,
        decodeUrls: false
      })
    );
  });

  it('clears the previous theme toast timer when themes are cycled rapidly', async () => {
    vi.useFakeTimers();
    saveSettings
      .mockResolvedValueOnce({
        sortMode: 'alphabetical',
        themeMode: 'system',
        urlIncludePattern: 'github',
        urlExcludePattern: '',
        textIncludePattern: '',
        textExcludePattern: '',
        useRegex: false,
        decodeUrls: false
      })
      .mockResolvedValueOnce({
        sortMode: 'alphabetical',
        themeMode: 'light',
        urlIncludePattern: 'github',
        urlExcludePattern: '',
        textIncludePattern: '',
        textExcludePattern: '',
        useRegex: false,
        decodeUrls: false
      });

    await loadResultsModule();

    document.getElementById('themeCycleButton').click();
    await Promise.resolve();
    vi.advanceTimersByTime(1000);

    document.getElementById('themeCycleButton').click();
    await Promise.resolve();

    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: Light');
    expect(document.getElementById('themeToast').textContent).toBe('Light theme selected.');

    vi.advanceTimersByTime(1000);
    expect(document.getElementById('themeToast').hidden).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(document.getElementById('themeToast').hidden).toBe(true);
    vi.useRealTimers();
  });

  it('downloads the current output as plain text', async () => {
    await loadResultsModule();

    document.getElementById('downloadButton').click();

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(buildDownloadFilename).toHaveBeenCalledWith(
      'Example Page',
      expect.objectContaining({
        sortMode: 'alphabetical',
        urlIncludePattern: 'github'
      }),
      'txt'
    );
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:download');
    expect(document.getElementById('messageText').textContent).toBe('Downloaded a plain-text file with one URL per line.');
  });

  it('downloads the current output as csv', async () => {
    await loadResultsModule();

    document.getElementById('downloadCsvButton').click();

    expect(formatEntriesAsCsv).toHaveBeenCalledWith(
      [{ displayUrl: 'https://github.com/repo' }],
      expect.objectContaining({
        sortMode: 'alphabetical',
        urlIncludePattern: 'github'
      })
    );
    expect(buildDownloadFilename).toHaveBeenCalledWith(
      'Example Page',
      expect.objectContaining({
        sortMode: 'alphabetical',
        urlIncludePattern: 'github'
      }),
      'csv'
    );
    expect(document.getElementById('messageText').textContent).toBe('Downloaded a CSV file with URL, text, and redirect details.');
  });

  it('shows a fallback summary when no saved result exists', async () => {
    getResultRecord.mockResolvedValue(null);

    await loadResultsModule();

    expect(document.getElementById('outputArea').value).toBe('');
    expect(document.getElementById('summaryText').textContent).toBe(
      'No saved extraction was found. Run Link Scoop again from the toolbar icon, keyboard shortcut, or context menu.'
    );
  });

  it('falls back to the page URL when the result title is missing', async () => {
    getResultRecord.mockResolvedValue({
      title: '',
      pageUrl: 'https://example.com/fallback',
      entries: [{ displayUrl: 'https://github.com/repo' }]
    });

    await loadResultsModule();

    expect(document.getElementById('summaryText').textContent).toBe(
      '1 links ready from https://example.com/fallback.'
    );
  });

  it('falls back to the active-tab label when title and page URL are both missing', async () => {
    getResultRecord.mockResolvedValue({
      title: '',
      pageUrl: '',
      entries: [{ displayUrl: 'https://github.com/repo' }]
    });

    await loadResultsModule();

    expect(document.getElementById('summaryText').textContent).toBe('1 links ready from the active tab.');
  });

  it('reports when there is nothing to copy', async () => {
    getVisibleEntries.mockReturnValue({
      entries: [],
      errors: [],
      hint: '',
      text: '',
      lines: []
    });

    await loadResultsModule();

    document.getElementById('copyButton').click();
    await Promise.resolve();

    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(document.getElementById('messageText').textContent).toBe('Nothing to copy yet.');
  });

  it('shows the processing hint when filters remove all visible links', async () => {
    getVisibleEntries.mockReturnValue({
      entries: [],
      errors: [],
      hint: 'No links matched the active filters: URL include. Try Reset Filters.',
      text: '',
      lines: []
    });

    await loadResultsModule();

    expect(document.getElementById('messageText').textContent).toBe(
      'No links matched the active filters: URL include. Try Reset Filters.'
    );
  });

  it('shows a refresh error message and re-enables the button', async () => {
    sendMessage.mockRejectedValue(new Error('Refresh failed'));

    await loadResultsModule();

    document.getElementById('refreshButton').click();
    await flushUi();

    expect(document.getElementById('messageText').textContent).toBe('Refresh failed');
    expect(document.getElementById('refreshButton').disabled).toBe(false);
  });

  it('falls back to the default refresh error message when none is provided', async () => {
    sendMessage.mockRejectedValue({});

    await loadResultsModule();

    document.getElementById('refreshButton').click();
    await flushUi();

    expect(document.getElementById('messageText').textContent).toBe('The source tab could not be re-scanned.');
    expect(document.getElementById('refreshButton').disabled).toBe(false);
  });

  it('shows theme-cycle persistence errors in the results status area', async () => {
    await loadResultsModule();

    saveSettings.mockRejectedValueOnce(new Error('Persist failed'));
    document.getElementById('themeCycleButton').click();
    await flushUi();

    expect(document.getElementById('messageText').textContent).toBe('Persist failed');
  });

  it('shows initialization errors in the results status area', async () => {
    getSettings.mockRejectedValueOnce(new Error('Settings unavailable'));

    await loadResultsModule();
    await flushUi();

    expect(document.getElementById('messageText').textContent).toBe('Settings unavailable');
  });

  it('handles select-all shortcuts by focusing and selecting the output', async () => {
    await loadResultsModule();

    const outputArea = document.getElementById('outputArea');
    const focusSpy = vi.spyOn(outputArea, 'focus');
    const selectSpy = vi.spyOn(outputArea, 'select');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));

    expect(shouldHandleSelectAllShortcut).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalledOnce();
    expect(selectSpy).toHaveBeenCalledOnce();
  });

  it('skips refresh runtime calls when there is no result id in the URL', async () => {
    window.history.replaceState({}, '', '?');

    await loadResultsModule();

    document.getElementById('refreshButton').click();
    await flushUi();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
