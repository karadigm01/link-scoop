export const THEME_MODES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

export function applyThemeMode(themeMode = THEME_MODES.SYSTEM, documentReference = document) {
  const documentElement = documentReference?.documentElement;
  if (!documentElement) {
    return;
  }

  if (themeMode === THEME_MODES.LIGHT || themeMode === THEME_MODES.DARK) {
    documentElement.dataset.theme = themeMode;
    documentElement.style.colorScheme = themeMode;
    return;
  }

  delete documentElement.dataset.theme;
  documentElement.style.colorScheme = 'light dark';
}