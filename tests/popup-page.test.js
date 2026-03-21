// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/extension/lib/settings.js', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  THEME_MODES: {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark'
  }
}));

import { getSettings, saveSettings } from '../src/extension/lib/settings.js';

function renderPopupDom() {
  document.body.innerHTML = `
    <main class="shell">
      <header class="hero">
        <button id="themeCycleButton" type="button">Theme: System</button>
      </header>
      <p id="themeToast" hidden></p>
      <section class="card compactCard">
        <p id="settingsSummary"></p>
        <p class="compactNote"></p>
      </section>
      <section class="actions">
        <button id="extractButton" type="button">Extract Links</button>
        <button id="helpButton" type="button">Quick Start</button>
      </section>
      <p id="statusMessage"></p>
    </main>
  `;
}

async function loadPopupModule() {
  vi.resetModules();
  await import('../src/extension/popup/popup.js');
  await Promise.resolve();
  await Promise.resolve();
}

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('popup page', () => {
  let sendMessage;
  let closeSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    renderPopupDom();

    sendMessage = vi.fn().mockResolvedValue(undefined);
    closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    globalThis.browser = {
      runtime: {
        sendMessage
      }
    };

    getSettings.mockResolvedValue({
      sortMode: 'alphabetical',
      themeMode: 'dark',
      urlIncludePattern: 'github',
      urlExcludePattern: 'issues',
      textIncludePattern: 'Docs',
      textExcludePattern: 'Archive',
      useRegex: true,
      decodeUrls: true
    });

    saveSettings.mockImplementation(async nextSettings => nextSettings);
  });

  afterEach(() => {
    vi.useRealTimers();
    closeSpy.mockRestore();
    delete globalThis.browser;
  });

  it('loads saved settings into the popup form', async () => {
    await loadPopupModule();

    expect(getSettings).toHaveBeenCalledOnce();
    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: Dark');
    expect(document.getElementById('settingsSummary').textContent).toBe(
      'Alphabetical • 4 active filters • regex on • URL decoding on'
    );
  });

  it('falls back to system labels and a default saved-settings summary when settings are empty', async () => {
    getSettings.mockResolvedValueOnce({
      sortMode: '',
      themeMode: '',
      urlIncludePattern: null,
      urlExcludePattern: undefined,
      textIncludePattern: '',
      textExcludePattern: null,
      useRegex: false,
      decodeUrls: false
    });

    await loadPopupModule();

    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: System');
    expect(document.getElementById('settingsSummary').textContent).toBe(
      'Original page order • no active filters • regex off • URL decoding off'
    );
    saveSettings.mockResolvedValueOnce({
      sortMode: 'light-does-not-matter',
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

    expect(saveSettings).toHaveBeenCalledWith({
      sortMode: '',
      themeMode: 'light',
      urlIncludePattern: null,
      urlExcludePattern: undefined,
      textIncludePattern: '',
      textExcludePattern: null,
      useRegex: false,
      decodeUrls: false
    });
    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: System');
    expect(document.getElementById('themeToast').textContent).toBe('System theme selected.');
  });

  it('renders a compact summary when only some filters are active', async () => {
    getSettings.mockResolvedValueOnce({
      sortMode: 'original',
      themeMode: 'dark',
      urlIncludePattern: 'docs',
      urlExcludePattern: '',
      textIncludePattern: '',
      textExcludePattern: '',
      useRegex: false,
      decodeUrls: false
    });

    await loadPopupModule();

    expect(document.getElementById('settingsSummary').textContent).toBe(
      'Original page order • 1 active filter • regex off • URL decoding off'
    );
  });

  it('extracts links and closes the popup without resaving unchanged settings', async () => {
    await loadPopupModule();

    document.getElementById('extractButton').click();
    await flushUi();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'extract-active-tab' });
    expect(saveSettings).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledOnce();
    expect(document.getElementById('extractButton').disabled).toBe(false);
  });

  it('applies the saved theme to the popup document', async () => {
    await loadPopupModule();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('cycles the theme from the popup toolbar button and shows a toast', async () => {
    vi.useFakeTimers();

    await loadPopupModule();

    saveSettings.mockResolvedValueOnce({
      sortMode: 'alphabetical',
      themeMode: 'system',
      urlIncludePattern: 'github',
      urlExcludePattern: 'issues',
      textIncludePattern: 'Docs',
      textExcludePattern: 'Archive',
      useRegex: true,
      decodeUrls: true
    });

    document.getElementById('themeCycleButton').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(saveSettings).toHaveBeenCalledWith({
      sortMode: 'alphabetical',
      themeMode: 'system',
      urlIncludePattern: 'github',
      urlExcludePattern: 'issues',
      textIncludePattern: 'Docs',
      textExcludePattern: 'Archive',
      useRegex: true,
      decodeUrls: true
    });
    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: System');
    expect(document.getElementById('themeToast').textContent).toBe('System theme selected.');
    expect(document.getElementById('themeToast').hidden).toBe(false);

    vi.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(document.getElementById('themeToast').hidden).toBe(true);
    expect(document.getElementById('themeToast').textContent).toBe('');
  });

  it('clears the previous popup theme toast timer when themes are cycled rapidly', async () => {
    vi.useFakeTimers();

    await loadPopupModule();

    saveSettings
      .mockResolvedValueOnce({
        sortMode: 'alphabetical',
        themeMode: 'system',
        urlIncludePattern: 'github',
        urlExcludePattern: 'issues',
        textIncludePattern: 'Docs',
        textExcludePattern: 'Archive',
        useRegex: true,
        decodeUrls: true
      })
      .mockResolvedValueOnce({
        sortMode: 'alphabetical',
        themeMode: 'light',
        urlIncludePattern: 'github',
        urlExcludePattern: 'issues',
        textIncludePattern: 'Docs',
        textExcludePattern: 'Archive',
        useRegex: true,
        decodeUrls: true
      });

    document.getElementById('themeCycleButton').click();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(1000);

    document.getElementById('themeCycleButton').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('themeCycleButton').textContent).toBe('Theme: Light');
    expect(document.getElementById('themeToast').textContent).toBe('Light theme selected.');

    vi.advanceTimersByTime(1000);
    expect(document.getElementById('themeToast').hidden).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(document.getElementById('themeToast').hidden).toBe(true);
  });

  it('falls back to the default extraction error message when no error message exists', async () => {
    sendMessage.mockRejectedValueOnce({});

    await loadPopupModule();

    document.getElementById('extractButton').click();
    await flushUi();

    expect(document.getElementById('statusMessage').textContent).toBe(
      'Link Scoop could not extract links from this tab.'
    );
  });

  it('shows theme-cycle persistence errors in the status area', async () => {
    await loadPopupModule();

    saveSettings.mockRejectedValueOnce(new Error('Save failed'));
    document.getElementById('themeCycleButton').click();
    await flushUi();

    expect(document.getElementById('statusMessage').textContent).toBe('Save failed');
  });

  it('opens onboarding from the help button and closes the popup', async () => {
    await loadPopupModule();

    document.getElementById('helpButton').click();
    await flushUi();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'open-onboarding', section: 'overview' });
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('shows an extraction error in the status area without closing the popup', async () => {
    sendMessage.mockRejectedValueOnce(new Error('Cannot access this tab'));

    await loadPopupModule();

    document.getElementById('extractButton').click();
    await flushUi();

    expect(document.getElementById('statusMessage').textContent).toBe('Cannot access this tab');
    expect(closeSpy).not.toHaveBeenCalled();
    expect(document.getElementById('extractButton').disabled).toBe(false);
  });

  it('shows initialization errors in the status area', async () => {
    getSettings.mockRejectedValueOnce(new Error('Storage unavailable'));

    await loadPopupModule();
    await flushUi();

    expect(document.getElementById('statusMessage').textContent).toBe('Storage unavailable');
  });
});
