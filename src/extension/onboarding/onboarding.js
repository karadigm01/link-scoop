import { getSettings } from '../lib/settings.js';
import { applyThemeMode } from '../lib/theme.js';

async function initialize() {
  const settings = await getSettings();
  applyThemeMode(settings.themeMode);
}

initialize().catch(() => {});