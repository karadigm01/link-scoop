const MAX_FILENAME_LENGTH = 120;
const FILTER_VALUE_MAX_LENGTH = 20;

function sanitizeSegment(value, maxLength = Infinity) {
  const normalizedValue = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');

  return normalizedValue;
}

function sanitizeFilterValue(value) {
  return sanitizeSegment(String(value).trim(), FILTER_VALUE_MAX_LENGTH) || 'value';
}

export function buildDownloadFilename(pageTitle = 'links', settings = {}, extension = 'txt') {
  const normalizedExtensionInput = extension == null || extension === '' ? 'txt' : String(extension);
  const normalizedExtension = normalizedExtensionInput.toLowerCase().replace(/[^a-z0-9]/g, '') || 'txt';
  const filterSuffixes = [
    ['include', settings?.urlIncludePattern],
    ['exclude', settings?.urlExcludePattern],
    ['text', settings?.textIncludePattern],
    ['textexcl', settings?.textExcludePattern]
  ]
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => `-${label}-${sanitizeFilterValue(value)}`)
    .join('');

  const fixedSuffix = `-links${filterSuffixes}.${normalizedExtension}`;
  const maxTitleLength = Math.max(1, MAX_FILENAME_LENGTH - fixedSuffix.length);
  const normalizedTitleInput = pageTitle == null || pageTitle === '' ? 'links' : String(pageTitle);
  const normalizedTitle = sanitizeSegment(normalizedTitleInput, maxTitleLength) || 'links';

  return `${normalizedTitle}${fixedSuffix}`;
}

export function shouldHandleSelectAllShortcut(event) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 'a';
}
