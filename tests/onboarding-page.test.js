// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/extension/lib/settings.js', () => ({
  getSettings: vi.fn()
}));

vi.mock('../src/extension/lib/theme.js', () => ({
  applyThemeMode: vi.fn()
}));

import { getSettings } from '../src/extension/lib/settings.js';
import { applyThemeMode } from '../src/extension/lib/theme.js';

async function loadOnboardingModule() {
  vi.resetModules();
  await import('../src/extension/onboarding/onboarding.js');
  await Promise.resolve();
  await Promise.resolve();
}

describe('onboarding page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<main class="layout"></main>';
  });

  it('loads saved settings and applies the saved theme', async () => {
    getSettings.mockResolvedValue({ themeMode: 'dark' });

    await loadOnboardingModule();

    expect(getSettings).toHaveBeenCalledOnce();
    expect(applyThemeMode).toHaveBeenCalledWith('dark');
  });

  it('swallows initialization errors without applying a theme', async () => {
    getSettings.mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(loadOnboardingModule()).resolves.toBeUndefined();

    expect(getSettings).toHaveBeenCalledOnce();
    expect(applyThemeMode).not.toHaveBeenCalled();
  });
});