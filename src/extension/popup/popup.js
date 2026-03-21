import { getSettings, saveSettings, THEME_MODES } from '../lib/settings.js';
import { applyThemeMode } from '../lib/theme.js';

const statusMessage = document.getElementById('statusMessage');
const settingsSummary = document.getElementById('settingsSummary');
const extractButton = document.getElementById('extractButton');
const helpButton = document.getElementById('helpButton');
const themeCycleButton = document.getElementById('themeCycleButton');
const themeToast = document.getElementById('themeToast');
const THEME_SEQUENCE = [THEME_MODES.SYSTEM, THEME_MODES.LIGHT, THEME_MODES.DARK];
const THEME_LABELS = {
  [THEME_MODES.SYSTEM]: 'System',
  [THEME_MODES.LIGHT]: 'Light',
  [THEME_MODES.DARK]: 'Dark'
};
const SORT_LABELS = {
  original: 'Original page order',
  alphabetical: 'Alphabetical'
};

let themeToastTimeoutId = null;
let activeSettings = null;

function setStatus(message) {
  statusMessage.textContent = message;
}

function updateThemeButtonLabel(themeMode) {
  themeCycleButton.textContent = `Theme: ${THEME_LABELS[themeMode] || THEME_LABELS[THEME_MODES.SYSTEM]}`;
}

function getActiveFilterCount(settings) {
  return [
    settings.urlIncludePattern,
    settings.urlExcludePattern,
    settings.textIncludePattern,
    settings.textExcludePattern
  ].filter(value => Boolean(value?.trim())).length;
}

function renderSettingsSummary(settings) {
  const sortLabel = SORT_LABELS[settings.sortMode] || SORT_LABELS.original;
  const activeFilterCount = getActiveFilterCount(settings);
  const filterLabel = activeFilterCount === 0 ? 'no active filters' : `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`;
  const regexLabel = settings.useRegex ? 'regex on' : 'regex off';
  const decodeLabel = settings.decodeUrls ? 'URL decoding on' : 'URL decoding off';

  settingsSummary.textContent = `${sortLabel} • ${filterLabel} • ${regexLabel} • ${decodeLabel}`;
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
  themeToast.textContent = `${THEME_LABELS[themeMode] || THEME_LABELS[THEME_MODES.SYSTEM]} theme selected.`;
  themeToast.hidden = false;
  themeToastTimeoutId = setTimeout(() => {
    themeToastTimeoutId = null;
    themeToast.hidden = true;
    themeToast.textContent = '';
  }, 2000);
}

function applySettingsState(settings) {
  updateThemeButtonLabel(settings.themeMode || THEME_MODES.SYSTEM);
  renderSettingsSummary(settings);
}

async function cycleTheme() {
  const currentThemeMode = activeSettings?.themeMode || THEME_MODES.SYSTEM;
  const currentIndex = THEME_SEQUENCE.indexOf(currentThemeMode);
  const nextThemeMode = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
  activeSettings = await saveSettings({
    ...activeSettings,
    themeMode: nextThemeMode
  });

  applyThemeMode(activeSettings.themeMode);
  applySettingsState(activeSettings);
  showThemeToast(activeSettings.themeMode);
}

function cycleThemeWithStatus() {
  cycleTheme().catch(error => setStatus(error.message));
}

async function extractLinks() {
  setStatus('Scanning the active tab…');
  extractButton.disabled = true;

  try {
    await browser.runtime.sendMessage({ type: 'extract-active-tab' });
    window.close();
  } catch (error) {
    setStatus(error.message || 'Link Scoop could not extract links from this tab.');
  } finally {
    extractButton.disabled = false;
  }
}

async function initialize() {
  activeSettings = await getSettings();
  applyThemeMode(activeSettings.themeMode);
  applySettingsState(activeSettings);

  themeCycleButton.addEventListener('click', cycleThemeWithStatus);

  extractButton.addEventListener('click', extractLinks);
  helpButton.addEventListener('click', async () => {
    await browser.runtime.sendMessage({ type: 'open-onboarding', section: 'overview' });
    window.close();
  });
}

initialize().catch(error => setStatus(error.message));
