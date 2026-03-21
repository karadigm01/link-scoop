import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

async function loadManifest() {
  const manifestBuffer = await readFile(new URL('../src/extension/manifest.json', import.meta.url));
  return JSON.parse(manifestBuffer.toString('utf8'));
}

describe('manifest', () => {
  it('renames the extension to Link Scoop and clarifies active-tab scope', async () => {
    const manifest = await loadManifest();

    expect(manifest.name).toBe('Link Scoop');
    expect(manifest.description).toContain('active tab');
  });

  it('keeps toolbar placement and theme icons without popup wiring', async () => {
    const manifest = await loadManifest();

    expect(manifest.action.default_area).toBe('navbar');
    expect(manifest.action).not.toHaveProperty('default_popup');
    expect(manifest.action.theme_icons).toHaveLength(2);
    expect(manifest.action.theme_icons[0]).toEqual({
      dark: 'assets/icons/icon-16-dark.svg',
      light: 'assets/icons/icon-16-light.svg',
      size: 16
    });
  });

  it('declares permissions for menus, scripting, storage, and local file access guidance', async () => {
    const manifest = await loadManifest();

    expect(manifest.permissions).toEqual(expect.arrayContaining(['menus', 'scripting', 'storage', 'tabs']));
    expect(manifest.optional_host_permissions).toContain('file:///*');
  });

  it('supports Firefox background scripts alongside MV3 service workers', async () => {
    const manifest = await loadManifest();

    expect(manifest.background.scripts).toEqual(['background/service-worker.js']);
    expect(manifest.background.service_worker).toBe('background/service-worker.js');
    expect(manifest.background.preferred_environment).toEqual(['document', 'service_worker']);
    expect(manifest.background.type).toBe('module');
  });

  it('declares a customizable keyboard shortcut for extraction', async () => {
    const manifest = await loadManifest();

    expect(manifest.commands['extract-links']).toEqual({
      suggested_key: {
        default: 'Ctrl+Shift+L',
        mac: 'Command+Shift+L'
      },
      description: 'Extract links from the active tab'
    });
  });
});
