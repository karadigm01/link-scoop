import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SORT_MODES,
  THEME_MODES,
  getSettings,
  mergeSettings,
  saveSettings
} from '../src/extension/lib/settings.js';
import {
  getCurrentResultId,
  getResultRecord,
  getResultStorageKey,
  pruneOldResults,
  saveResultRecord,
  updateResultRecord
} from '../src/extension/lib/results-store.js';

function createMockStorage(initialState = {}) {
  const state = { ...initialState };

  return {
    async get(keys) {
      if (typeof keys === 'string') {
        return { [keys]: state[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map(key => [key, state[key]]));
      }

      return { ...state };
    },
    async set(values) {
      Object.assign(state, values);
    },
    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach(key => {
        delete state[key];
      });
    },
    snapshot() {
      return { ...state };
    }
  };
}

describe('settings storage', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('merges defaults and normalizes invalid settings', () => {
    expect(mergeSettings()).toEqual(DEFAULT_SETTINGS);

    expect(
      mergeSettings({
        sortMode: 'unexpected-mode',
        themeMode: 'neon',
        useRegex: 1,
        decodeUrls: 'yes'
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      sortMode: SORT_MODES.ORIGINAL,
      themeMode: THEME_MODES.SYSTEM,
      useRegex: true,
      decodeUrls: true
    });
  });

  it('returns defaults when nothing is stored', async () => {
    const settings = await getSettings(storage);
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('saves and merges partial settings into storage', async () => {
    const savedSettings = await saveSettings(
      {
        sortMode: SORT_MODES.ALPHABETICAL,
        themeMode: THEME_MODES.DARK,
        urlIncludePattern: 'github',
        decodeUrls: true
      },
      storage
    );

    expect(savedSettings).toEqual({
      ...DEFAULT_SETTINGS,
      sortMode: SORT_MODES.ALPHABETICAL,
      themeMode: THEME_MODES.DARK,
      urlIncludePattern: 'github',
      decodeUrls: true
    });

    expect(storage.snapshot()).toEqual({
      [SETTINGS_STORAGE_KEY]: savedSettings
    });
  });

  it('reads back previously stored settings', async () => {
    storage = createMockStorage({
      [SETTINGS_STORAGE_KEY]: {
        ...DEFAULT_SETTINGS,
        themeMode: THEME_MODES.LIGHT,
        textExcludePattern: 'archive',
        useRegex: true
      }
    });

    const settings = await getSettings(storage);
    expect(settings.textExcludePattern).toBe('archive');
    expect(settings.useRegex).toBe(true);
    expect(settings.themeMode).toBe(THEME_MODES.LIGHT);
  });
});

describe('results storage', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('builds deterministic result storage keys', () => {
    expect(getResultStorageKey('result-7')).toBe('linkScoopResult:result-7');
  });

  it('saves a result record and increments the sequence', async () => {
    const resultId = await saveResultRecord(
      {
        entries: [{ displayUrl: 'https://example.com' }],
        title: 'Example',
        pageUrl: 'https://example.com'
      },
      storage
    );

    expect(resultId).toBe('result-1');
    expect(storage.snapshot()).toEqual({
      linkScoopCurrentResultId: 'result-1',
      linkScoopResultSequence: 2,
      'linkScoopResult:result-1': {
        entries: [{ displayUrl: 'https://example.com' }],
        title: 'Example',
        pageUrl: 'https://example.com',
        resultId: 'result-1'
      }
    });
  });

  it('returns null when no result id is provided or missing', async () => {
    await expect(getResultRecord(null, storage)).resolves.toBeNull();
    await expect(getResultRecord('result-404', storage)).resolves.toBeNull();
  });

  it('returns the current result id from storage', async () => {
    storage = createMockStorage({
      linkScoopCurrentResultId: 'result-9'
    });

    await expect(getCurrentResultId(storage)).resolves.toBe('result-9');
  });

  it('returns null when the current result id is missing', async () => {
    await expect(getCurrentResultId(storage)).resolves.toBeNull();
  });

  it('updates an existing result record and preserves the result id', async () => {
    storage = createMockStorage({
      'linkScoopResult:result-3': {
        resultId: 'result-3',
        title: 'Before',
        pageUrl: 'https://before.example',
        entries: [{ displayUrl: 'https://before.example' }]
      }
    });

    const updatedRecord = await updateResultRecord(
      'result-3',
      {
        title: 'After',
        entries: [{ displayUrl: 'https://after.example' }]
      },
      storage
    );

    expect(updatedRecord).toEqual({
      resultId: 'result-3',
      title: 'After',
      pageUrl: 'https://before.example',
      entries: [{ displayUrl: 'https://after.example' }]
    });

    expect(storage.snapshot()).toEqual({
      'linkScoopResult:result-3': updatedRecord,
      linkScoopCurrentResultId: 'result-3'
    });
  });

  it('throws when updating a missing saved result', async () => {
    await expect(updateResultRecord('result-12', { title: 'Missing' }, storage)).rejects.toThrow(
      'Saved result could not be found. Please run a new extraction.'
    );
  });

  it('prunes oldest result records beyond the configured maximum', async () => {
    const initialState = {
      linkScoopCurrentResultId: 'result-55'
    };

    for (let sequenceNumber = 1; sequenceNumber <= 55; sequenceNumber += 1) {
      initialState[`linkScoopResult:result-${sequenceNumber}`] = {
        resultId: `result-${sequenceNumber}`,
        title: `Result ${sequenceNumber}`
      };
    }

    storage = createMockStorage(initialState);

    const removedKeys = await pruneOldResults(50, storage);
    const snapshot = storage.snapshot();
    const resultKeys = Object.keys(snapshot).filter(key => key.startsWith('linkScoopResult:'));

    expect(removedKeys).toEqual([
      'linkScoopResult:result-1',
      'linkScoopResult:result-2',
      'linkScoopResult:result-3',
      'linkScoopResult:result-4',
      'linkScoopResult:result-5'
    ]);
    expect(resultKeys).toHaveLength(50);
    expect(snapshot['linkScoopResult:result-55']).toEqual({
      resultId: 'result-55',
      title: 'Result 55'
    });
  });

  it('never removes the current result id while pruning', async () => {
    const initialState = {
      linkScoopCurrentResultId: 'result-2'
    };

    for (let sequenceNumber = 1; sequenceNumber <= 4; sequenceNumber += 1) {
      initialState[`linkScoopResult:result-${sequenceNumber}`] = {
        resultId: `result-${sequenceNumber}`,
        title: `Result ${sequenceNumber}`
      };
    }

    storage = createMockStorage(initialState);

    const removedKeys = await pruneOldResults(2, storage);
    const snapshot = storage.snapshot();

    expect(removedKeys).toEqual([
      'linkScoopResult:result-1',
      'linkScoopResult:result-3'
    ]);
    expect(snapshot['linkScoopResult:result-2']).toEqual({
      resultId: 'result-2',
      title: 'Result 2'
    });
    expect(snapshot['linkScoopResult:result-4']).toEqual({
      resultId: 'result-4',
      title: 'Result 4'
    });
    expect(Object.keys(snapshot).filter(key => key.startsWith('linkScoopResult:'))).toHaveLength(2);
  });

  it('returns no removals when stored results are already within the limit', async () => {
    storage = createMockStorage({
      linkScoopCurrentResultId: 'result-2',
      'linkScoopResult:result-1': { resultId: 'result-1', title: 'Result 1' },
      'linkScoopResult:result-2': { resultId: 'result-2', title: 'Result 2' }
    });

    await expect(pruneOldResults(2, storage)).resolves.toEqual([]);
    expect(storage.snapshot()).toEqual({
      linkScoopCurrentResultId: 'result-2',
      'linkScoopResult:result-1': { resultId: 'result-1', title: 'Result 1' },
      'linkScoopResult:result-2': { resultId: 'result-2', title: 'Result 2' }
    });
  });

  it('ignores malformed result keys while pruning and falls back to null current result ids', async () => {
    storage = createMockStorage({
      'linkScoopResult:not-a-sequence': { resultId: 'not-a-sequence', title: 'Broken' },
      'linkScoopResult:result-1': { resultId: 'result-1', title: 'Result 1' },
      'linkScoopResult:result-2': { resultId: 'result-2', title: 'Result 2' }
    });

    const removedKeys = await pruneOldResults(1, storage);

    expect(removedKeys).toEqual(['linkScoopResult:result-1']);
    expect(storage.snapshot()['linkScoopResult:not-a-sequence']).toEqual({ resultId: 'not-a-sequence', title: 'Broken' });
    expect(storage.snapshot()['linkScoopResult:result-2']).toEqual({ resultId: 'result-2', title: 'Result 2' });
  });

  it('returns no removals when the only overflow record is the current result', async () => {
    storage = createMockStorage({
      linkScoopCurrentResultId: 'result-1',
      'linkScoopResult:result-1': { resultId: 'result-1', title: 'Result 1' },
      linkScoopResultSequence: 2
    });

    await expect(pruneOldResults(0, storage)).resolves.toEqual([]);
    expect(storage.snapshot()).toEqual({
      linkScoopCurrentResultId: 'result-1',
      'linkScoopResult:result-1': { resultId: 'result-1', title: 'Result 1' },
      linkScoopResultSequence: 2
    });
  });
});
