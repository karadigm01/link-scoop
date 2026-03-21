import { beforeEach, describe, expect, it, vi } from 'vitest';

const extractLinksFromSnapshot = vi.fn();
const getResultRecord = vi.fn();
const pruneOldResults = vi.fn();
const saveResultRecord = vi.fn();
const updateResultRecord = vi.fn();

vi.mock('../src/extension/lib/link-processing.js', () => ({
  extractLinksFromSnapshot
}));

vi.mock('../src/extension/lib/results-store.js', () => ({
  getResultRecord,
  pruneOldResults,
  saveResultRecord,
  updateResultRecord
}));

function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    async trigger(...args) {
      const results = [];
      for (const listener of listeners) {
        results.push(await listener(...args));
      }
      return results;
    },
    get listeners() {
      return listeners;
    }
  };
}

function createBrowserMock() {
  const runtimeOnInstalled = createEvent();
  const runtimeOnMessage = createEvent();
  const runtimeOnStartup = createEvent();
  const menusOnClicked = createEvent();
  const commandsOnCommand = createEvent();
  const actionOnClicked = createEvent();

  return {
    action: {
      onClicked: actionOnClicked
    },
    commands: {
      onCommand: commandsOnCommand
    },
    menus: {
      removeAll: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      onClicked: menusOnClicked
    },
    runtime: {
      onInstalled: runtimeOnInstalled,
      onMessage: runtimeOnMessage,
      onStartup: runtimeOnStartup,
      getURL: vi.fn(path => `moz-extension://test/${path}`)
    },
    tabs: {
      create: vi.fn(async options => options),
      get: vi.fn(),
      query: vi.fn()
    },
    scripting: {
      executeScript: vi.fn()
    },
    permissions: {
      contains: vi.fn(),
      request: vi.fn()
    },
    _events: {
      actionOnClicked,
      commandsOnCommand,
      runtimeOnInstalled,
      runtimeOnMessage,
      runtimeOnStartup,
      menusOnClicked
    }
  };
}

async function loadServiceWorker() {
  vi.resetModules();
  await import('../src/extension/background/service-worker.js');
  await Promise.resolve();
  await Promise.resolve();
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('background service worker', () => {
  let browserMock;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    browserMock = createBrowserMock();
    globalThis.browser = browserMock;
    globalThis.chrome = undefined;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    extractLinksFromSnapshot.mockReturnValue({
      entries: [{ displayUrl: 'https://example.com' }],
      pageUrl: 'https://example.com',
      title: 'Example'
    });

    saveResultRecord.mockResolvedValue('result-1');
    pruneOldResults.mockResolvedValue([]);
    getResultRecord.mockResolvedValue({
      resultId: 'result-1',
      sourceTabId: 9,
      entries: [{ displayUrl: 'https://example.com' }],
      title: 'Stored',
      pageUrl: 'https://example.com'
    });
    updateResultRecord.mockResolvedValue({ resultId: 'result-1' });

    browserMock.tabs.get.mockResolvedValue({ id: 9, url: 'https://example.com/page' });
    browserMock.tabs.query.mockResolvedValue([{ id: 9, url: 'https://example.com/page' }]);
    browserMock.scripting.executeScript.mockResolvedValue([
      {
        result: {
          pageUrl: 'https://example.com/page',
          title: 'Page',
          links: [{ resolvedHref: 'https://example.com', text: 'Example', domIndex: 0 }]
        }
      }
    ]);
    browserMock.permissions.contains.mockResolvedValue(true);
    browserMock.permissions.request.mockResolvedValue(true);
  });

  it('creates menus on startup and on module load', async () => {
    await loadServiceWorker();

    expect(browserMock.menus.removeAll).toHaveBeenCalledTimes(1);
    expect(browserMock.menus.create).toHaveBeenCalledWith({
      id: 'link-scoop-root',
      title: 'Link Scoop',
      contexts: ['all']
    });
    expect(browserMock.menus.create).toHaveBeenCalledWith({
      id: 'link-scoop-extract',
      parentId: 'link-scoop-root',
      title: 'Extract Links',
      contexts: ['page', 'frame', 'selection', 'link', 'image', 'video', 'audio']
    });

    await browserMock._events.runtimeOnStartup.trigger();
    expect(browserMock.menus.removeAll).toHaveBeenCalledTimes(2);
  });

  it('opens onboarding only for non-temporary installs', async () => {
    await loadServiceWorker();

    await browserMock._events.runtimeOnInstalled.trigger({ reason: 'install', temporary: false });
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/onboarding/onboarding.html#overview'
    });

    browserMock.tabs.create.mockClear();
    await browserMock._events.runtimeOnInstalled.trigger({ reason: 'install', temporary: true });
    expect(browserMock.tabs.create).not.toHaveBeenCalled();
  });

  it('extracts from the active tab via runtime messaging', async () => {
    await loadServiceWorker();

    const [response] = await browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' });

    expect(browserMock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 9 },
      func: expect.any(Function)
    });
    expect(extractLinksFromSnapshot).toHaveBeenCalled();
    expect(saveResultRecord).toHaveBeenCalledWith({
      entries: [{ displayUrl: 'https://example.com' }],
      pageUrl: 'https://example.com',
      sourceTabId: 9,
      title: 'Example'
    });
    expect(pruneOldResults).toHaveBeenCalledWith();
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/results/results.html?resultId=result-1'
    });
    expect(response).toEqual({ resultId: 'result-1' });
  });

  it('extracts from the active tab via keyboard command', async () => {
    await loadServiceWorker();

    await browserMock._events.commandsOnCommand.trigger('extract-links');
    await flushAsyncWork();

    expect(browserMock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(saveResultRecord).toHaveBeenCalledWith({
      entries: [{ displayUrl: 'https://example.com' }],
      pageUrl: 'https://example.com',
      sourceTabId: 9,
      title: 'Example'
    });
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/results/results.html?resultId=result-1'
    });
  });

  it('extracts from the active tab when the toolbar icon is clicked', async () => {
    await loadServiceWorker();

    await browserMock._events.actionOnClicked.trigger();
    await flushAsyncWork();

    expect(browserMock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(saveResultRecord).toHaveBeenCalledWith({
      entries: [{ displayUrl: 'https://example.com' }],
      pageUrl: 'https://example.com',
      sourceTabId: 9,
      title: 'Example'
    });
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/results/results.html?resultId=result-1'
    });
  });

  it('uses a self-contained injected snapshot function', async () => {
    await loadServiceWorker();
    await browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' });

    const injectedFunction = browserMock.scripting.executeScript.mock.calls[0][0].func;
    const previousDocument = globalThis.document;
    globalThis.document = {
      baseURI: 'https://example.com/page',
      title: 'Injected Page',
      querySelectorAll: vi.fn(() => [
        {
          getAttribute: vi.fn(() => '/one'),
          href: 'https://example.com/one',
          textContent: ' One   Link '
        }
      ])
    };

    try {
      expect(injectedFunction()).toEqual({
        pageUrl: 'https://example.com/page',
        title: 'Injected Page',
        links: [
          {
            domIndex: 0,
            rawHref: '/one',
            resolvedHref: 'https://example.com/one',
            text: 'One Link'
          }
        ]
      });
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it('falls back to chrome when browser is unavailable and uses empty injected snapshot fields', async () => {
    delete globalThis.browser;
    globalThis.chrome = browserMock;

    await loadServiceWorker();
    await browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' });

    const injectedFunction = browserMock.scripting.executeScript.mock.calls[0][0].func;
    const previousDocument = globalThis.document;
    globalThis.document = {
      baseURI: 'https://example.com/page',
      title: '',
      querySelectorAll: vi.fn(() => [
        {
          getAttribute: vi.fn(() => null),
          href: 'https://example.com/one',
          textContent: null
        }
      ])
    };

    try {
      expect(injectedFunction()).toEqual({
        pageUrl: 'https://example.com/page',
        title: '',
        links: [
          {
            domIndex: 0,
            rawHref: '',
            resolvedHref: 'https://example.com/one',
            text: ''
          }
        ]
      });
    } finally {
      globalThis.document = previousDocument;
      globalThis.browser = browserMock;
      globalThis.chrome = undefined;
    }
  });

  it('falls back to an empty snapshot when script execution returns no result', async () => {
    browserMock.scripting.executeScript.mockResolvedValue([]);
    extractLinksFromSnapshot.mockReturnValue({
      entries: [],
      pageUrl: '',
      title: ''
    });

    await loadServiceWorker();

    const [response] = await browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' });

    expect(extractLinksFromSnapshot).toHaveBeenCalledWith({
      pageUrl: '',
      title: '',
      links: []
    });
    expect(saveResultRecord).toHaveBeenCalledWith({
      entries: [],
      pageUrl: '',
      sourceTabId: 9,
      title: ''
    });
    expect(pruneOldResults).toHaveBeenCalledWith();
    expect(response).toEqual({ resultId: 'result-1' });
  });

  it('refreshes a stored result via runtime messaging', async () => {
    await loadServiceWorker();

    const [response] = await browserMock._events.runtimeOnMessage.trigger({ type: 'refresh-result', resultId: 'result-1' });

    expect(getResultRecord).toHaveBeenCalledWith('result-1');
    expect(updateResultRecord).toHaveBeenCalledWith('result-1', {
      entries: [{ displayUrl: 'https://example.com' }],
      pageUrl: 'https://example.com',
      title: 'Example'
    });
    expect(response).toEqual({ resultId: 'result-1' });
  });

  it('opens onboarding from runtime messages', async () => {
    await loadServiceWorker();

    await browserMock._events.runtimeOnMessage.trigger({ type: 'open-onboarding', section: 'file-access' });

    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/onboarding/onboarding.html#file-access'
    });
  });

  it('defaults onboarding messages to the overview section', async () => {
    await loadServiceWorker();

    await browserMock._events.runtimeOnMessage.trigger({ type: 'open-onboarding' });

    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/onboarding/onboarding.html#overview'
    });
  });

  it('handles local file tabs by requesting permission when needed', async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 9, url: 'file:///tmp/example.html' });
    browserMock.permissions.contains.mockResolvedValue(false);
    browserMock.permissions.request.mockResolvedValue(true);

    await loadServiceWorker();
    await browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' });

    expect(browserMock.permissions.contains).toHaveBeenCalledWith({ origins: ['file:///*'] });
    expect(browserMock.permissions.request).toHaveBeenCalledWith({ origins: ['file:///*'] });
    expect(saveResultRecord).toHaveBeenCalled();
  });

  it('treats missing permissions APIs as unavailable file access', async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 9, url: 'file:///tmp/example.html' });
    browserMock.permissions.contains = undefined;
    browserMock.permissions.request = undefined;

    await loadServiceWorker();

    await expect(browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' })).rejects.toThrow(
      'Link Scoop needs permission to read local file:/// pages. If Firefox blocks the request, open about:addons, choose Link Scoop, and enable file access for local files.'
    );
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/onboarding/onboarding.html#file-access'
    });
  });

  it('opens file-access onboarding and rejects when local file permission is unavailable', async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 9, url: 'file:///tmp/example.html' });
    browserMock.permissions.contains.mockResolvedValue(false);
    browserMock.permissions.request.mockResolvedValue(false);

    await loadServiceWorker();

    await expect(browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' })).rejects.toThrow(
      'Link Scoop needs permission to read local file:/// pages. If Firefox blocks the request, open about:addons, choose Link Scoop, and enable file access for local files.'
    );
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: 'moz-extension://test/onboarding/onboarding.html#file-access'
    });
  });

  it('treats thrown permission requests as unavailable file access', async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 9, url: 'file:///tmp/example.html' });
    browserMock.permissions.contains.mockResolvedValue(false);
    browserMock.permissions.request.mockRejectedValue(new Error('Blocked'));

    await loadServiceWorker();

    await expect(browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' })).rejects.toThrow(
      'Link Scoop needs permission to read local file:/// pages. If Firefox blocks the request, open about:addons, choose Link Scoop, and enable file access for local files.'
    );
  });

  it('propagates execution failures from script injection', async () => {
    browserMock.scripting.executeScript.mockRejectedValue(new Error('Injection blocked'));

    await loadServiceWorker();

    await expect(browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' })).rejects.toThrow('Injection blocked');
  });

  it('uses the built-in execution fallback message when injection fails without an error message', async () => {
    browserMock.scripting.executeScript.mockRejectedValue({});

    await loadServiceWorker();

    await expect(browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' })).rejects.toThrow(
      'Link Scoop could not scan this tab. Firefox restricts some built-in and privileged pages.'
    );
  });

  it('uses the file-access fallback message when local execution fails without an error message', async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 9, url: 'file:///tmp/example.html' });
    browserMock.permissions.contains.mockResolvedValue(true);
    browserMock.scripting.executeScript.mockRejectedValue({});

    await loadServiceWorker();

    await expect(browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' })).rejects.toThrow(
      'Link Scoop needs permission to read local file:/// pages. If Firefox blocks the request, open about:addons, choose Link Scoop, and enable file access for local files.'
    );
  });

  it('handles context-menu extraction clicks and logs failures', async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 21, url: 'https://example.com/clicked' });
    saveResultRecord.mockRejectedValueOnce(new Error('Cannot save result'));

    await loadServiceWorker();
    browserMock._events.menusOnClicked.trigger({ menuItemId: 'link-scoop-extract' }, { id: 21 });
    await flushAsyncWork();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Cannot save result');
  });

  it('returns undefined for unknown runtime messages', async () => {
    await loadServiceWorker();

    const [response] = await browserMock._events.runtimeOnMessage.trigger({ type: 'unknown-message' });
    expect(response).toBeUndefined();
  });

  it('throws when there is no active tab to extract from', async () => {
    browserMock.tabs.query.mockResolvedValue([]);

    await loadServiceWorker();

    await expect(browserMock._events.runtimeOnMessage.trigger({ type: 'extract-active-tab' })).rejects.toThrow(
      'No active tab is available.'
    );
  });

  it('ignores unrelated context-menu clicks', async () => {
    await loadServiceWorker();

    await browserMock._events.menusOnClicked.trigger({ menuItemId: 'different-menu' }, { id: 21 });

    expect(browserMock.tabs.get).not.toHaveBeenCalled();
    expect(saveResultRecord).not.toHaveBeenCalled();
  });

  it('throws when refreshing a result with no source tab', async () => {
    getResultRecord.mockResolvedValueOnce({ resultId: 'result-2', sourceTabId: null });

    await loadServiceWorker();

    await expect(
      browserMock._events.runtimeOnMessage.trigger({ type: 'refresh-result', resultId: 'result-2' })
    ).rejects.toThrow('The original tab is no longer available. Run a fresh extraction.');
  });

  it('does not open onboarding for update installs', async () => {
    await loadServiceWorker();

    await browserMock._events.runtimeOnInstalled.trigger({ reason: 'update', temporary: false });

    expect(browserMock.tabs.create).not.toHaveBeenCalled();
  });
});
