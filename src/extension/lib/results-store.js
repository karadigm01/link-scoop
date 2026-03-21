const RESULT_STORAGE_PREFIX = 'linkScoopResult:';
const CURRENT_RESULT_ID_KEY = 'linkScoopCurrentResultId';
const RESULT_SEQUENCE_KEY = 'linkScoopResultSequence';

function getResultSequenceNumber(resultId = '') {
  const match = /^result-(\d+)$/.exec(resultId);
  return match ? Number(match[1]) : Number.NaN;
}

export function getResultStorageKey(resultId) {
  return `${RESULT_STORAGE_PREFIX}${resultId}`;
}

export async function saveResultRecord(record, storageArea = browser.storage.local) {
  const storedValues = await storageArea.get(RESULT_SEQUENCE_KEY);
  const nextSequence = Number(storedValues[RESULT_SEQUENCE_KEY] || 1);
  const resultId = `result-${nextSequence}`;
  const storageKey = getResultStorageKey(resultId);

  await storageArea.set({
    [storageKey]: {
      ...record,
      resultId
    },
    [CURRENT_RESULT_ID_KEY]: resultId,
    [RESULT_SEQUENCE_KEY]: nextSequence + 1
  });

  return resultId;
}

export async function pruneOldResults(maxResults = 50, storageArea = browser.storage.local) {
  const safeMaxResults = Math.max(0, Number(maxResults) || 0);
  const storedValues = await storageArea.get();
  const currentResultId = storedValues[CURRENT_RESULT_ID_KEY] || null;
  const resultEntries = Object.keys(storedValues)
    .filter(key => key.startsWith(RESULT_STORAGE_PREFIX))
    .map(key => {
      const resultId = key.slice(RESULT_STORAGE_PREFIX.length);
      return {
        key,
        resultId,
        sequenceNumber: getResultSequenceNumber(resultId)
      };
    })
    .filter(entry => Number.isFinite(entry.sequenceNumber))
    .sort((leftEntry, rightEntry) => leftEntry.sequenceNumber - rightEntry.sequenceNumber);

  const overflowCount = resultEntries.length - safeMaxResults;
  if (overflowCount <= 0) {
    return [];
  }

  const removableKeys = resultEntries
    .filter(entry => entry.resultId !== currentResultId)
    .slice(0, overflowCount)
    .map(entry => entry.key);

  if (removableKeys.length === 0) {
    return [];
  }

  await storageArea.remove(removableKeys);
  return removableKeys;
}

export async function getResultRecord(resultId, storageArea = browser.storage.local) {
  if (!resultId) {
    return null;
  }

  const storageKey = getResultStorageKey(resultId);
  const storedValues = await storageArea.get(storageKey);
  return storedValues[storageKey] || null;
}

export async function updateResultRecord(resultId, record, storageArea = browser.storage.local) {
  const storageKey = getResultStorageKey(resultId);
  const previousRecord = await getResultRecord(resultId, storageArea);

  if (!previousRecord) {
    throw new Error('Saved result could not be found. Please run a new extraction.');
  }

  const nextRecord = {
    ...previousRecord,
    ...record,
    resultId
  };

  await storageArea.set({
    [storageKey]: nextRecord,
    [CURRENT_RESULT_ID_KEY]: resultId
  });

  return nextRecord;
}

export async function getCurrentResultId(storageArea = browser.storage.local) {
  const storedValues = await storageArea.get(CURRENT_RESULT_ID_KEY);
  return storedValues[CURRENT_RESULT_ID_KEY] || null;
}
