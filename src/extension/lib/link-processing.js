import { DEFAULT_SETTINGS, SORT_MODES, mergeSettings } from './settings.js';

const REDIRECT_QUERY_KEYS = new Set([
  'dest',
  'destination',
  'next',
  'out',
  'r',
  'redir',
  'redirect',
  'redirect_uri',
  'redirect_url',
  'target',
  'to',
  'u',
  'url'
]);

const SKIPPED_PROTOCOL_PREFIXES = [
  'about:',
  'blob:',
  'data:',
  'javascript:',
  'moz-extension:'
];

const FILTER_LABELS = {
  urlIncludePattern: 'URL include',
  urlExcludePattern: 'URL exclude',
  textIncludePattern: 'Text include',
  textExcludePattern: 'Text exclude'
};

export function cleanLinkText(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

export function isSkippedProtocol(value = '') {
  const normalizedValue = value.trim().toLowerCase();
  return SKIPPED_PROTOCOL_PREFIXES.some(prefix => normalizedValue.startsWith(prefix));
}

export function resolveHref(rawHref, baseUrl) {
  if (!rawHref || isSkippedProtocol(rawHref)) {
    return null;
  }

  try {
    return new URL(rawHref, baseUrl).href;
  } catch {
    return null;
  }
}

function decodeCandidate(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeRedirectCandidate(candidateValue, baseUrl) {
  const preparedCandidates = [candidateValue, decodeCandidate(candidateValue)]
    .map(value => value.trim())
    .filter(Boolean);

  for (const candidate of preparedCandidates) {
    if (isSkippedProtocol(candidate)) {
      continue;
    }

    try {
      const normalizedUrl = new URL(candidate, baseUrl).href;
      if (!isSkippedProtocol(normalizedUrl)) {
        return normalizedUrl;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function extractRedirectTargets(urlValue) {
  const surfacedTargets = [];
  let parsedUrl;

  try {
    parsedUrl = new URL(urlValue);
  } catch {
    return surfacedTargets;
  }

  const candidateValues = [];

  for (const [key, value] of parsedUrl.searchParams.entries()) {
    if (REDIRECT_QUERY_KEYS.has(key.toLowerCase()) && value) {
      candidateValues.push(value);
    }
  }

  const hashValue = parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash;
  if (hashValue && hashValue.includes('=')) {
    const hashParams = new URLSearchParams(hashValue);
    for (const [key, value] of hashParams.entries()) {
      if (REDIRECT_QUERY_KEYS.has(key.toLowerCase()) && value) {
        candidateValues.push(value);
      }
    }
  }

  for (const candidateValue of candidateValues) {
    const normalizedTarget = normalizeRedirectCandidate(candidateValue, urlValue);
    if (normalizedTarget && normalizedTarget !== urlValue && !surfacedTargets.includes(normalizedTarget)) {
      surfacedTargets.push(normalizedTarget);
    }
  }

  return surfacedTargets;
}

function createEntry(displayUrl, text, domIndex, variantIndex, surfaced = false, sourceUrl = null) {
  return {
    displayUrl,
    text,
    domIndex,
    variantIndex,
    surfaced,
    sourceUrl
  };
}

export function extractLinksFromSnapshot(snapshot) {
  const pageUrl = snapshot?.pageUrl || snapshot?.url || 'https://example.invalid/';
  const sourceLinks = Array.isArray(snapshot?.links) ? snapshot.links : [];
  const entries = [];

  for (let index = 0; index < sourceLinks.length; index += 1) {
    const link = sourceLinks[index];
    const domIndex = Number.isFinite(link?.domIndex) ? link.domIndex : index;
    const rawHref = link?.resolvedHref || link?.rawHref || link?.href;
    const resolvedHref = resolveHref(rawHref, pageUrl);

    if (!resolvedHref) {
      continue;
    }

    const linkText = cleanLinkText(link?.text || '');
    entries.push(createEntry(resolvedHref, linkText, domIndex, 0));

    const redirectTargets = extractRedirectTargets(resolvedHref);
    redirectTargets.forEach((targetUrl, targetIndex) => {
      entries.push(createEntry(targetUrl, linkText, domIndex, targetIndex + 1, true, resolvedHref));
    });
  }

  return {
    pageUrl,
    title: snapshot?.title || '',
    entries
  };
}

// IMPORTANT: This function mirrors collectAnchorsSnapshot() in
// ../background/service-worker.js. The service-worker version is injected into
// pages via scripting.executeScript and must be self-contained. If you change
// the snapshot shape or field names here, update that function to match.
export function snapshotFromDocument(documentReference) {
  const anchors = Array.from(documentReference.querySelectorAll('a[href]'));
  return {
    pageUrl: documentReference.baseURI,
    title: documentReference.title || '',
    links: anchors.map((anchor, index) => ({
      domIndex: index,
      rawHref: anchor.getAttribute('href') || '',
      resolvedHref: anchor.href,
      text: cleanLinkText(anchor.textContent || '')
    }))
  };
}

function createMatcher(pattern, useRegex, label, errors) {
  if (!pattern.trim()) {
    return null;
  }

  if (!useRegex) {
    const terms = pattern
      .split(',')
      .map(term => term.trim().toLowerCase())
      .filter(Boolean);

    if (terms.length === 0) {
      return null;
    }

    if (terms.length === 1) {
      return value => value.toLowerCase().includes(terms[0]);
    }

    return value => {
      const normalizedValue = value.toLowerCase();
      return terms.some(term => normalizedValue.includes(term));
    };
  }

  try {
    const regex = new RegExp(pattern, 'i');
    return value => regex.test(value);
  } catch {
    errors.push(`${label} regex is invalid.`);
    return null;
  }
}

export function filterEntries(entries, settings = DEFAULT_SETTINGS) {
  const activeSettings = mergeSettings(settings);
  const errors = [];
  const urlIncludeMatcher = createMatcher(activeSettings.urlIncludePattern, activeSettings.useRegex, 'URL include', errors);
  const urlExcludeMatcher = createMatcher(activeSettings.urlExcludePattern, activeSettings.useRegex, 'URL exclude', errors);
  const textIncludeMatcher = createMatcher(activeSettings.textIncludePattern, activeSettings.useRegex, 'Text include', errors);
  const textExcludeMatcher = createMatcher(activeSettings.textExcludePattern, activeSettings.useRegex, 'Text exclude', errors);

  const filteredEntries = entries.filter(entry => {
    const currentUrl = entry.displayUrl || '';
    const currentText = entry.text || '';

    if (urlIncludeMatcher && !urlIncludeMatcher(currentUrl)) {
      return false;
    }

    if (urlExcludeMatcher && urlExcludeMatcher(currentUrl)) {
      return false;
    }

    if (textIncludeMatcher && !textIncludeMatcher(currentText)) {
      return false;
    }

    if (textExcludeMatcher && textExcludeMatcher(currentText)) {
      return false;
    }

    return true;
  });

  return {
    entries: filteredEntries,
    errors
  };
}

export function deduplicateEntries(entries) {
  const seenUrls = new Set();
  const uniqueEntries = [];

  for (const entry of entries) {
    if (seenUrls.has(entry.displayUrl)) {
      continue;
    }

    seenUrls.add(entry.displayUrl);
    uniqueEntries.push(entry);
  }

  return uniqueEntries;
}

export function sortEntries(entries, sortMode = DEFAULT_SETTINGS.sortMode) {
  const clonedEntries = [...entries];

  if (sortMode === SORT_MODES.ALPHABETICAL) {
    return clonedEntries.sort((leftEntry, rightEntry) => {
      return leftEntry.displayUrl.localeCompare(rightEntry.displayUrl, undefined, { sensitivity: 'base' }) ||
        leftEntry.domIndex - rightEntry.domIndex ||
        leftEntry.variantIndex - rightEntry.variantIndex;
    });
  }

  return clonedEntries.sort((leftEntry, rightEntry) => {
    return leftEntry.domIndex - rightEntry.domIndex ||
      leftEntry.variantIndex - rightEntry.variantIndex ||
      leftEntry.displayUrl.localeCompare(rightEntry.displayUrl, undefined, { sensitivity: 'base' });
  });
}

export function formatUrl(urlValue, decodeUrls = false) {
  if (!decodeUrls) {
    return urlValue;
  }

  try {
    return decodeURI(urlValue);
  } catch {
    return urlValue;
  }
}

export function formatEntriesAsPlainText(entries, settings = DEFAULT_SETTINGS) {
  const activeSettings = mergeSettings(settings);
  return entries.map(entry => formatUrl(entry.displayUrl, activeSettings.decodeUrls)).join('\n');
}

function escapeCsvValue(value) {
  const normalizedValue = String(value ?? '');

  if (!/[",\n]/.test(normalizedValue)) {
    return normalizedValue;
  }

  return `"${normalizedValue.replace(/"/g, '""')}"`;
}

export function formatEntriesAsCsv(entries, settings = DEFAULT_SETTINGS) {
  const activeSettings = mergeSettings(settings);
  const rows = [
    'url,link_text,is_redirect,redirect_source',
    ...entries.map(entry => {
      const urlValue = formatUrl(entry.displayUrl, activeSettings.decodeUrls);
      const redirectSource = entry.surfaced ? formatUrl(entry.sourceUrl || '', activeSettings.decodeUrls) : '';

      return [
        escapeCsvValue(urlValue),
        escapeCsvValue(entry.text || ''),
        entry.surfaced === true ? 'true' : 'false',
        escapeCsvValue(redirectSource)
      ].join(',');
    })
  ];

  return rows.join('\n');
}

function formatFilterLabelList(labels) {
  if (labels.length <= 1) {
    return labels.join('');
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function getActiveFilterLabels(settings) {
  return Object.entries(FILTER_LABELS)
    .filter(([key]) => settings[key].trim())
    .map(([, label]) => label);
}

function getInvalidFilterLabels(errors) {
  return new Set(
    errors
      .filter(error => error.endsWith(' regex is invalid.'))
      .map(error => error.replace(' regex is invalid.', ''))
  );
}

function buildEmptyStateHint(sourceEntries, visibleEntries, settings, errors) {
  if (visibleEntries.length > 0) {
    return '';
  }

  if (sourceEntries.length === 0) {
    return 'No links were found on this page.';
  }

  const invalidFilterLabels = getInvalidFilterLabels(errors);
  const activeFilterLabels = getActiveFilterLabels(settings).filter(label => !invalidFilterLabels.has(label));
  const filterLabelSummary = formatFilterLabelList(activeFilterLabels);
  const detailPrefix = ['', ': '][Number(Boolean(filterLabelSummary))];

  return `No links matched the active filters${detailPrefix}${filterLabelSummary}. Try Reset Filters.`;
}

export function getVisibleEntries(entries, settings = DEFAULT_SETTINGS) {
  const activeSettings = mergeSettings(settings);
  const { entries: filteredEntries, errors } = filterEntries(entries, activeSettings);
  const uniqueEntries = deduplicateEntries(filteredEntries);
  const sortedEntries = sortEntries(uniqueEntries, activeSettings.sortMode);
  const text = formatEntriesAsPlainText(sortedEntries, activeSettings);
  const hint = buildEmptyStateHint(entries, sortedEntries, activeSettings, errors);

  return {
    entries: sortedEntries,
    errors,
    hint,
    text,
    lines: text ? text.split('\n') : []
  };
}
