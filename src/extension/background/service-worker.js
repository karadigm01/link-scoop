import { extractLinksFromSnapshot } from '../lib/link-processing.js';
import { getResultRecord, pruneOldResults, saveResultRecord, updateResultRecord } from '../lib/results-store.js';

const browserApi = globalThis.browser ?? globalThis.chrome;
const FILE_PERMISSION = { origins: ['file:///*'] };
const MENU_IDS = {
  ROOT: 'link-scoop-root',
  EXTRACT: 'link-scoop-extract'
};

const FILE_ACCESS_MESSAGE = 'Link Scoop needs permission to read local file:/// pages. If Firefox blocks the request, open about:addons, choose Link Scoop, and enable file access for local files.';
const EXECUTION_ERROR_MESSAGE = 'Link Scoop could not scan this tab. Firefox restricts some built-in and privileged pages.';

async function createMenus() {
  await browserApi.menus.removeAll();

  browserApi.menus.create({
    id: MENU_IDS.ROOT,
    title: 'Link Scoop',
    contexts: ['all']
  });

  browserApi.menus.create({
    id: MENU_IDS.EXTRACT,
    parentId: MENU_IDS.ROOT,
    title: 'Extract Links',
    contexts: ['page', 'frame', 'selection', 'link', 'image', 'video', 'audio']
  });
}

function getOnboardingUrl(section = 'overview') {
  return browserApi.runtime.getURL(`onboarding/onboarding.html#${section}`);
}

function getResultsUrl(resultId) {
  return browserApi.runtime.getURL(`results/results.html?resultId=${encodeURIComponent(resultId)}`);
}

async function openTab(url) {
  return browserApi.tabs.create({
    active: true,
    url
  });
}

async function openOnboarding(section = 'overview') {
  await openTab(getOnboardingUrl(section));
}

async function ensureFileAccess(tab) {
  if (!tab?.url?.startsWith('file:')) {
    return true;
  }

  if (!browserApi.permissions?.contains || !browserApi.permissions?.request) {
    return false;
  }

  const alreadyGranted = await browserApi.permissions.contains(FILE_PERMISSION);
  if (alreadyGranted) {
    return true;
  }

  try {
    return await browserApi.permissions.request(FILE_PERMISSION);
  } catch {
    return false;
  }
}

// IMPORTANT: This function is injected into the page via scripting.executeScript
// and must be fully self-contained (no imports). It mirrors snapshotFromDocument()
// in ../lib/link-processing.js — if you change the snapshot shape or field names
// here, update that function to match, and vice versa.
function collectAnchorsSnapshot() {
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  return {
    pageUrl: document.baseURI,
    title: document.title || '',
    links: anchors.map((anchor, index) => ({
      domIndex: index,
      rawHref: anchor.getAttribute('href') || '',
      resolvedHref: anchor.href,
      text: (anchor.textContent || '').replace(/\s+/g, ' ').trim()
    }))
  };
}

async function runExtraction(tabId) {
  const executionResults = await browserApi.scripting.executeScript({
    target: { tabId },
    func: collectAnchorsSnapshot
  });

  return executionResults?.[0]?.result || {
    pageUrl: '',
    title: '',
    links: []
  };
}

async function extractFromTab(tabId) {
  const tab = await browserApi.tabs.get(tabId);
  const fileAccessGranted = await ensureFileAccess(tab);

  if (!fileAccessGranted) {
    await openOnboarding('file-access');
    throw new Error(FILE_ACCESS_MESSAGE);
  }

  try {
    const snapshot = await runExtraction(tabId);
    const { entries, pageUrl, title } = extractLinksFromSnapshot(snapshot);
    const resultId = await saveResultRecord({
      entries,
      pageUrl,
      sourceTabId: tabId,
      title
    });
    await pruneOldResults();

    await openTab(getResultsUrl(resultId));
    return { resultId };
  } catch (error) {
    const message = tab?.url?.startsWith('file:') ? FILE_ACCESS_MESSAGE : EXECUTION_ERROR_MESSAGE;
    throw new Error(error?.message || message);
  }
}

async function extractFromActiveTab() {
  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.id) {
    throw new Error('No active tab is available.');
  }

  return extractFromTab(activeTab.id);
}

async function refreshResult(resultId) {
  const existingResult = await getResultRecord(resultId);
  if (!existingResult?.sourceTabId) {
    throw new Error('The original tab is no longer available. Run a fresh extraction.');
  }

  const snapshot = await runExtraction(existingResult.sourceTabId);
  const { entries, pageUrl, title } = extractLinksFromSnapshot(snapshot);

  await updateResultRecord(resultId, {
    entries,
    pageUrl,
    title
  });

  return { resultId };
}

browserApi.runtime.onInstalled.addListener(async details => {
  await createMenus();

  if (details.reason === 'install' && !details.temporary) {
    await openOnboarding('overview');
  }
});

browserApi.runtime.onStartup.addListener(createMenus);
browserApi.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_IDS.EXTRACT && tab?.id) {
    extractFromTab(tab.id).catch(error => console.error(error.message));
  }
});

browserApi.commands?.onCommand.addListener(command => {
  if (command === 'extract-links') {
    extractFromActiveTab().catch(error => console.error(error.message));
  }
});

browserApi.action.onClicked.addListener(() => {
  extractFromActiveTab().catch(error => console.error(error.message));
});

browserApi.runtime.onMessage.addListener(message => {
  if (message?.type === 'extract-active-tab') {
    return extractFromActiveTab();
  }

  if (message?.type === 'refresh-result') {
    return refreshResult(message.resultId);
  }

  if (message?.type === 'open-onboarding') {
    return openOnboarding(message.section || 'overview');
  }

  return undefined;
});

createMenus().catch(error => console.error(error.message));
