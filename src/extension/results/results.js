import { formatEntriesAsCsv, getVisibleEntries } from '../lib/link-processing.js';
import { getResultRecord } from '../lib/results-store.js';
import { getSettings, saveSettings, THEME_MODES } from '../lib/settings.js';
import { applyThemeMode } from '../lib/theme.js';
import { buildDownloadFilename, shouldHandleSelectAllShortcut } from './helpers.js';

const sortInputs = Array.from(document.querySelectorAll('input[name="sortMode"]'));
const outputArea = document.getElementById('outputArea');
const summaryText = document.getElementById('summaryText');
const messageText = document.getElementById('messageText');
const refreshButton = document.getElementById('refreshButton');
const copyButton = document.getElementById('copyButton');
const downloadButton = document.getElementById('downloadButton');
const downloadCsvButton = document.getElementById('downloadCsvButton');
const localFileBanner = document.getElementById('localFileBanner');
const quickStartButton = document.getElementById('quickStartButton');
const themeCycleButton = document.getElementById('themeCycleButton');
const resetFiltersButton = document.getElementById('resetFiltersButton');
const themeToast = document.getElementById('themeToast');
const formFieldIds = [
  'urlIncludePattern',
  'urlExcludePattern',
  'textIncludePattern',
  'textExcludePattern',
  'useRegex',
  'decodeUrls'
];

const searchParams = new URLSearchParams(window.location.search);
const resultId = searchParams.get('resultId');
const COPY_BUTTON_DEFAULT_LABEL = 'Copy All';
const COPY_BUTTON_SUCCESS_LABEL = 'Copied!';
let resultRecord = null;
let activeSettings = null;
let copyToastTimeoutId = null;
let themeToastTimeoutId = null;

const THEME_SEQUENCE = [THEME_MODES.SYSTEM, THEME_MODES.LIGHT, THEME_MODES.DARK];
const THEME_LABELS = {
  [THEME_MODES.SYSTEM]: 'System',
  [THEME_MODES.LIGHT]: 'Light',
  [THEME_MODES.DARK]: 'Dark'
};

function setMessage(message) {
  messageText.textContent = message;
}

function updateLocalFileBanner() {
  const isLocalFile = resultRecord?.pageUrl?.startsWith('file:') === true;
  localFileBanner.hidden = !isLocalFile;
}

function updateThemeButtonLabel(themeMode) {
  themeCycleButton.textContent = `Theme: ${THEME_LABELS[themeMode] || THEME_LABELS[THEME_MODES.SYSTEM]}`;
}

function applyFormState(settings) {
  sortInputs.forEach(input => {
    input.checked = input.value === settings.sortMode;
  });

  updateThemeButtonLabel(settings.themeMode || THEME_MODES.SYSTEM);

  formFieldIds.forEach(fieldId => {
    const element = document.getElementById(fieldId);
    if (element.type === 'checkbox') {
      element.checked = Boolean(settings[fieldId]);
      return;
    }

    element.value = settings[fieldId] || '';
  });
}

function readFormState() {
  return {
    sortMode: sortInputs.find(input => input.checked)?.value || 'original',
    themeMode: activeSettings?.themeMode || THEME_MODES.SYSTEM,
    urlIncludePattern: document.getElementById('urlIncludePattern').value,
    urlExcludePattern: document.getElementById('urlExcludePattern').value,
    textIncludePattern: document.getElementById('textIncludePattern').value,
    textExcludePattern: document.getElementById('textExcludePattern').value,
    useRegex: document.getElementById('useRegex').checked,
    decodeUrls: document.getElementById('decodeUrls').checked
  };
}

function getResetFilterState() {
  return {
    ...readFormState(),
    urlIncludePattern: '',
    urlExcludePattern: '',
    textIncludePattern: '',
    textExcludePattern: '',
    useRegex: false,
    decodeUrls: false
  };
}

function getRenderedEntriesState() {
  return getVisibleEntries(resultRecord?.entries || [], activeSettings);
}

function resetCopyToast() {
  if (copyToastTimeoutId) {
    clearTimeout(copyToastTimeoutId);
    copyToastTimeoutId = null;
  }

  copyButton.textContent = COPY_BUTTON_DEFAULT_LABEL;
  copyButton.classList.remove('toast-success');
}

function showCopyToast() {
  resetCopyToast();
  copyButton.textContent = COPY_BUTTON_SUCCESS_LABEL;
  copyButton.classList.add('toast-success');
  copyToastTimeoutId = setTimeout(() => {
    copyToastTimeoutId = null;
    copyButton.textContent = COPY_BUTTON_DEFAULT_LABEL;
    copyButton.classList.remove('toast-success');
  }, 2000);
}

function resetThemeToast() {
  if (themeToastTimeoutId) {
    clearTimeout(themeToastTimeoutId);
    themeToastTimeoutId = null;
  }

  themeToast.hidden = true;
  themeToast.textContent = '';
}

function showThemeToast(themeMode) {
  resetThemeToast();
  themeToast.textContent = `${THEME_LABELS[themeMode] || 'System'} theme selected.`;
  themeToast.hidden = false;
  themeToastTimeoutId = setTimeout(() => {
    themeToastTimeoutId = null;
    themeToast.hidden = true;
    themeToast.textContent = '';
  }, 2000);
}

async function cycleTheme() {
  const currentThemeMode = activeSettings?.themeMode || THEME_MODES.SYSTEM;
  const currentIndex = THEME_SEQUENCE.indexOf(currentThemeMode);
  const nextThemeMode = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];

  activeSettings = await saveSettings({ ...readFormState(), themeMode: nextThemeMode });
  applyThemeMode(activeSettings.themeMode);
  applyFormState(activeSettings);
  renderOutput();
  showThemeToast(activeSettings.themeMode);
}

async function resetFilters() {
  activeSettings = await saveSettings(getResetFilterState());
  applyThemeMode(activeSettings.themeMode);
  applyFormState(activeSettings);
  renderOutput();
}

function renderOutput() {
  if (!resultRecord) {
    updateLocalFileBanner();
    outputArea.value = '';
    summaryText.textContent = 'No saved extraction was found. Run Link Scoop again from the toolbar icon, keyboard shortcut, or context menu.';
    return;
  }

  updateLocalFileBanner();
  const { entries, errors, text, lines, hint } = getRenderedEntriesState();
  outputArea.value = text;
  summaryText.textContent = `${entries.length} links ready from ${resultRecord.title || resultRecord.pageUrl || 'the active tab'}.`;
  setMessage(errors[0] || hint || `${lines.length} clean lines ready for copy or export.`);
}

async function persistAndRender() {
  activeSettings = await saveSettings(readFormState());
  applyThemeMode(activeSettings.themeMode);
  renderOutput();
}

async function copyAll() {
  if (!outputArea.value) {
    setMessage('Nothing to copy yet.');
    return;
  }

  await navigator.clipboard.writeText(outputArea.value);
  outputArea.focus();
  outputArea.select();
  showCopyToast();
  setMessage(`Copied ${outputArea.value.split('\n').filter(Boolean).length} links to the clipboard.`);
}

function downloadText() {
  const { text } = getRenderedEntriesState();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = buildDownloadFilename(resultRecord?.title || 'link-scoop', activeSettings, 'txt');
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
  setMessage('Downloaded a plain-text file with one URL per line.');
}

function downloadCsv() {
  const { entries } = getRenderedEntriesState();
  const csvText = formatEntriesAsCsv(entries, activeSettings);
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = buildDownloadFilename(resultRecord?.title || 'link-scoop', activeSettings, 'csv');
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
  setMessage('Downloaded a CSV file with URL, text, and redirect details.');
}

async function refreshScan() {
  if (!resultId) {
    return;
  }

  refreshButton.disabled = true;
  setMessage('Refreshing the source tab…');

  try {
    await browser.runtime.sendMessage({ type: 'refresh-result', resultId });
    resultRecord = await getResultRecord(resultId);
    renderOutput();
  } catch (error) {
    setMessage(error.message || 'The source tab could not be re-scanned.');
  } finally {
    refreshButton.disabled = false;
  }
}

function persistAndRenderWithStatus() {
  persistAndRender().catch(error => setMessage(error.message));
}

function copyAllWithStatus() {
  copyAll().catch(error => setMessage(error.message));
}

function cycleThemeWithStatus() {
  cycleTheme().catch(error => setMessage(error.message));
}

function resetFiltersWithStatus() {
  resetFilters().catch(error => setMessage(error.message));
}

function refreshScanWithStatus() {
  refreshScan().catch(error => setMessage(error.message));
}

async function openQuickStart() {
  await browser.runtime.sendMessage({ type: 'open-onboarding', section: 'overview' });
}

function openQuickStartWithStatus() {
  openQuickStart().catch(error => setMessage(error.message));
}

async function initialize() {
  activeSettings = await getSettings();
  applyThemeMode(activeSettings.themeMode);
  applyFormState(activeSettings);
  resultRecord = await getResultRecord(resultId);
  renderOutput();

  document.addEventListener('input', persistAndRenderWithStatus);

  document.addEventListener('change', persistAndRenderWithStatus);

  document.addEventListener('keydown', event => {
    if (shouldHandleSelectAllShortcut(event)) {
      event.preventDefault();
      outputArea.focus();
      outputArea.select();
    }
  });

  copyButton.addEventListener('click', copyAllWithStatus);

  quickStartButton.addEventListener('click', openQuickStartWithStatus);
  themeCycleButton.addEventListener('click', cycleThemeWithStatus);
  resetFiltersButton.addEventListener('click', resetFiltersWithStatus);

  downloadButton.addEventListener('click', downloadText);
  downloadCsvButton.addEventListener('click', downloadCsv);
  refreshButton.addEventListener('click', refreshScanWithStatus);
}

initialize().catch(error => setMessage(error.message));
