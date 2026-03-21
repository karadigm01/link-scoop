// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { applyThemeMode, THEME_MODES } from '../src/extension/lib/theme.js';

describe('theme helper', () => {
  it('exports the supported theme modes', () => {
    expect(THEME_MODES).toEqual({
      SYSTEM: 'system',
      LIGHT: 'light',
      DARK: 'dark'
    });
  });

  it('returns safely when no document element is available', () => {
    expect(() => applyThemeMode(THEME_MODES.DARK, {})).not.toThrow();
    expect(() => applyThemeMode(THEME_MODES.LIGHT, null)).not.toThrow();
  });

  it('applies the dark theme explicitly', () => {
    applyThemeMode(THEME_MODES.DARK, document);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('applies the light theme explicitly', () => {
    applyThemeMode(THEME_MODES.LIGHT, document);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('clears explicit theme state when system mode is requested', () => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';

    applyThemeMode(THEME_MODES.SYSTEM, document);

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe('light dark');
  });

  it('defaults to system mode when no theme is provided', () => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';

    applyThemeMode(undefined, document);

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe('light dark');
  });
});