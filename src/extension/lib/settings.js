export const SORT_MODES = {
  ORIGINAL: 'original',
  ALPHABETICAL: 'alphabetical'
};

export const THEME_MODES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

export const SETTINGS_STORAGE_KEY = 'linkScoopSettings';

export const DEFAULT_SETTINGS = {
  sortMode: SORT_MODES.ORIGINAL,
  themeMode: THEME_MODES.SYSTEM,
  urlIncludePattern: '',
  urlExcludePattern: '',
  textIncludePattern: '',
  textExcludePattern: '',
  useRegex: false,
  decodeUrls: false
};

export function mergeSettings(storedSettings = {}) {
  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings
  };

  if (!Object.values(SORT_MODES).includes(mergedSettings.sortMode)) {
    mergedSettings.sortMode = DEFAULT_SETTINGS.sortMode;
  }

  if (!Object.values(THEME_MODES).includes(mergedSettings.themeMode)) {
    mergedSettings.themeMode = DEFAULT_SETTINGS.themeMode;
  }

  mergedSettings.useRegex = Boolean(mergedSettings.useRegex);
  mergedSettings.decodeUrls = Boolean(mergedSettings.decodeUrls);

  return mergedSettings;
}

export async function getSettings(storageArea = browser.storage.local) {
  const storedValue = await storageArea.get(SETTINGS_STORAGE_KEY);
  return mergeSettings(storedValue[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(partialSettings, storageArea = browser.storage.local) {
  const currentSettings = await getSettings(storageArea);
  const nextSettings = mergeSettings({
    ...currentSettings,
    ...partialSettings
  });

  await storageArea.set({
    [SETTINGS_STORAGE_KEY]: nextSettings
  });

  return nextSettings;
}
