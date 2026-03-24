# Link Scoop

**Clean link extraction for Firefox.** Extract links from the active tab, filter by URL or visible text, and export them as plain text or CSV from the results page.

[Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/link-scoop/) · [Report a Bug](https://github.com/karadigm01/link-scoop/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/karadigm01/link-scoop/issues/new?template=feature_request.md)

---

## Features

- **One-click extraction** — click the toolbar icon and the results page opens immediately with links from the active tab
- **Preserves page order** by default — links stay in the order they appear in the page DOM unless you switch to alphabetical sorting
- **Include and exclude filters** — filter by URL or visible link text, with optional regex support
- **Multi-tag filters** — separate multiple terms with commas, such as `affiliate, advertisement, tracking`, to match any of them when regex is off
- **Reset Filters** — clear active filters without affecting sort order or theme
- **Broad protocol support** — captures `http`, `https`, `mailto`, `ftp`, `tel`, `magnet`, and other non-skipped link protocols
- **Redirect detection** — surfaces hidden target URLs from redirect and referrer-style links
- **Clean output** — one URL per line in a plain-text textarea
- **Copy All** — copies the current visible output with inline button confirmation
- **Download as TXT** — exports the current visible output as a text file
- **Download as CSV** — exports URL, link text, redirect status, and redirect source URL columns
- **Smart filenames** — download filenames reflect active filter values when present
- **Keyboard shortcut** — `Ctrl+Shift+L` on Windows/Linux and `Command+Shift+L` on macOS
- **Context menu** — right-click any supported page and choose `Link Scoop → Extract Links`
- **Theme toggle** — switch between system, light, and dark themes from the results page header
- **Empty-state hints** — when filters remove all results, Link Scoop explains that no links matched the active filters instead of showing a blank result
- **Local file support** — works on `file:///` HTML pages after Firefox grants local file access
- **Decode toggle** — optionally decode percent-encoded URLs in the displayed output and exports
- **Refresh Scan** — re-extract from the original tab without leaving the results page
- **Quick Start** — reopen onboarding from the results page header

## Installation

### Firefox Add-ons

Install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/link-scoop/).

### Temporary local install

1. Build the extension:

```bash
npm run build
```

2. Open `about:debugging#/runtime/this-firefox`
3. Choose **Load Temporary Add-on**
4. Select `build/link-scoop/manifest.json`

Requires Firefox `140` or later on desktop.

## How to Use

1. Navigate to any supported page.
2. Click the **Link Scoop** toolbar icon.
3. Review the extracted links on the results page.
4. Filter, sort, copy, refresh, or export as needed.

You can also press **Ctrl+Shift+L** / **Command+Shift+L** or use the page context menu. If Firefox places the icon in the Extensions menu instead of the toolbar, open that menu and choose **Pin to Toolbar**.

## Privacy

Link Scoop runs entirely in your browser. No data is transmitted or collected outside of your local Firefox profile.

The extension stores results and settings locally so it can reopen extracted results, remember preferences, and support refresh behavior. It requests `<all_urls>` host access to support Refresh Scan on previously scanned tabs.

## Development

### Prerequisites

- Node.js
- npm

### Setup

```bash
git clone https://github.com/karadigm01/link-scoop.git
cd link-scoop
npm install
```

### Build

```bash
npm run build
```

The built extension is written to `build/link-scoop/`.

### Test

```bash
npm test
npx vitest run --coverage
```

Current verified status:

- `144/144` tests passing
- `100%` statements
- `100%` branches
- `100%` functions
- `100%` lines

## Scope

Link Scoop extracts links from the **active tab only**. It reads `<a href>` elements present in the page DOM at scan time, including links injected by JavaScript before extraction runs.

It does **not** extract:

- links from other tabs
- links from non-anchor elements
- skipped protocols such as `about:`, `blob:`, `data:`, `javascript:`, and `moz-extension:`
- links from browser-restricted pages such as many `about:` pages or extension pages

## FAQ

**Why can Link Scoop show fewer links from a saved local HTML file than from the live page?**

Saved HTML files often do not include links that were dynamically generated on the live page. Link Scoop extracts what actually exists in the DOM at scan time. Relative links from the original site can also appear as `file:///` paths when the saved file is opened locally.

**Can I filter for multiple terms at once without using regex?**

Yes. When regex is off, comma-separated terms in any filter field are treated as OR matches.

**Can Link Scoop extract links from all open tabs at once?**

Not currently. Link Scoop extracts from the active tab only.

**Does Link Scoop send my data anywhere?**

No. The extension code operates locally in Firefox and does not transmit extracted links to an external service.
