# Link Scoop

**Clean link extraction for Firefox.** Extract links from the active tab, then filter by URL or visible text and export as plain text or CSV from the results page.

[Open the GitHub Repository](https://github.com/karadigm01/link-scoop) · [Report a Bug](https://github.com/karadigm01/link-scoop/issues/new) · [Request a Feature](https://github.com/karadigm01/link-scoop/issues/new)

---

## Features

- **One-click extraction** — click the toolbar icon and the results page opens immediately with extracted links from the active tab
- **Preserves page order** by default — links are sorted in DOM order unless you switch to alphabetical sorting
- **Include and exclude filters** — filter by URL or by visible link text, with optional regex support
- **Multi-tag filters** — when regex is off, separate multiple terms with commas to match any of them
- **Reset Filters** — clear all active filters in one click without affecting sort order or theme
- **Anchor link extraction** — scans `<a href>` elements present in the page DOM at extraction time
- **Broad protocol support** — captures `http`, `https`, `mailto`, `ftp`, `tel`, `magnet`, and other non-skipped protocols
- **Redirect detection** — surfaces hidden destination URLs from common redirect and referrer-style links
- **Clean output** — renders one URL per line in a plain-text textarea
- **Copy All** — copies the current visible output to the clipboard with button feedback
- **Download as TXT** — exports the current visible output as a text file
- **Download as CSV** — exports URL, link text, redirect status, and redirect source columns
- **Smart filenames** — download filenames include active filter values when present
- **Keyboard shortcut** — `Ctrl+Shift+L` on Windows/Linux and `Command+Shift+L` on macOS
- **Context menu** — right-click any supported page and choose `Link Scoop → Extract Links`
- **Theme toggle** — cycle between system, light, and dark themes from the results page header
- **Empty-state hints** — when filters eliminate all results, Link Scoop explains that no links matched the active filters and names the active filter categories
- **Local file support** — works on `file:///` pages after Firefox grants local file access
- **Decode toggle** — optionally decode percent-encoded URLs in the displayed output and exports
- **Refresh Scan** — re-extract from the original tab without leaving the results page
- **Quick Start button** — reopen onboarding from the results page header

## Installation

### Temporary local install

1. Run the build:

```bash
npm run build
```

2. Open `about:debugging#/runtime/this-firefox`
3. Choose **Load Temporary Add-on**
4. Select `build/link-scoop/manifest.json`

### Firefox version

Requires Firefox `121` or later.

### Add-ons listing

A public Firefox Add-ons listing should only be linked here once the AMO page is live.

## How to Use

1. Navigate to a supported web page.
2. Click the **Link Scoop** toolbar icon.
3. Review the extracted links on the results page.
4. Filter, sort, copy, refresh, or export as needed.

You can also use the keyboard shortcut or the page context menu. If Firefox places the icon in the Extensions menu instead of the toolbar, open that menu and choose **Pin to Toolbar**.

## Privacy

Link Scoop runs locally in Firefox. The extension code does not send extracted links to an external service. Extracted results and preferences are stored in the local browser profile for extension functionality.

The extension currently requests permissions for active-tab extraction, context-menu access, scripting, storage, tabs, clipboard writing, and broad page access used by its extraction and refresh flows.

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

The build output is written to `build/link-scoop/`.

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

Link Scoop extracts links from the **active tab only**. It reads `<a href>` elements present in the page DOM at scan time, including links added by JavaScript before extraction runs.

It does **not** extract:

- links from other tabs
- links from non-anchor elements
- skipped protocols such as `about:`, `blob:`, `data:`, `javascript:`, and `moz-extension:`
- links from browser-restricted pages such as many `about:` pages or extension pages

## FAQ

**Q: Why can a saved local HTML file show fewer links than the live page?**

Saved HTML files may not contain links that were generated dynamically on the live site. Link Scoop extracts what actually exists in the DOM at scan time. Relative links from the original site can also resolve to `file:///` paths when the saved file is opened locally.

**Q: Can I filter for multiple terms without regex?**

Yes. With regex off, comma-separated terms in a filter field are treated as OR matches.

**Q: Can Link Scoop extract links from all open tabs at once?**

No. It currently extracts from the active tab only.

**Q: Does Link Scoop send my data anywhere?**

The extension code in this repository operates locally in the browser and does not transmit extracted links to an external service.
