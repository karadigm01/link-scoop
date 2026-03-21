import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VIRTUAL_BUILD_SCRIPT_PATH = '/virtual/workspace/scripts/build.mjs';
const VIRTUAL_WORKSPACE_ROOT = '/virtual/workspace';
const VIRTUAL_SOURCE_DIR = '/virtual/workspace/src/extension';
const VIRTUAL_OUTPUT_DIR = '/virtual/workspace/build/link-scoop';

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function loadBuildScript({ statResult, statError } = {}) {
  vi.resetModules();

  const cp = vi.fn().mockResolvedValue(undefined);
  const mkdir = vi.fn().mockResolvedValue(undefined);
  const rm = vi.fn().mockResolvedValue(undefined);
  const stat = vi.fn();

  if (statError) {
    stat.mockRejectedValue(statError);
  } else {
    stat.mockResolvedValue(statResult || { isDirectory: () => true });
  }

  vi.doMock('node:fs/promises', () => ({
    cp,
    mkdir,
    rm,
    stat
  }));

  vi.doMock('node:url', () => ({
    fileURLToPath: vi.fn(() => VIRTUAL_BUILD_SCRIPT_PATH)
  }));

  await import('../scripts/build.mjs');
  await flushTasks();

  return { cp, mkdir, rm, stat };
}

describe('build script', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let originalExitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unmock('node:fs/promises');
    vi.unmock('node:url');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it('copies the extension source into the build directory when the source exists', async () => {
    const { cp, mkdir, rm, stat } = await loadBuildScript();

    expect(stat).toHaveBeenCalledWith(VIRTUAL_SOURCE_DIR);
    expect(rm).toHaveBeenCalledWith(VIRTUAL_OUTPUT_DIR, { recursive: true, force: true });
    expect(mkdir).toHaveBeenCalledWith(VIRTUAL_OUTPUT_DIR, { recursive: true });
    expect(cp).toHaveBeenCalledWith(VIRTUAL_SOURCE_DIR, VIRTUAL_OUTPUT_DIR, { recursive: true });
    expect(consoleLogSpy).toHaveBeenCalledWith(`Built Link Scoop into ${VIRTUAL_OUTPUT_DIR}`);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('reports a missing source directory and sets a failing exit code', async () => {
    const { cp, mkdir, rm, stat } = await loadBuildScript({
      statResult: { isDirectory: () => false }
    });

    expect(stat).toHaveBeenCalledWith(VIRTUAL_SOURCE_DIR);
    expect(rm).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Missing extension source directory: ${VIRTUAL_SOURCE_DIR}`);
    expect(process.exitCode).toBe(1);
  });

  it('reports stat failures as missing source directory errors', async () => {
    const { cp, mkdir, rm, stat } = await loadBuildScript({
      statError: new Error('ENOENT')
    });

    expect(stat).toHaveBeenCalledWith(VIRTUAL_SOURCE_DIR);
    expect(rm).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Missing extension source directory: ${VIRTUAL_SOURCE_DIR}`);
    expect(process.exitCode).toBe(1);
  });
});
