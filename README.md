# Canvas Command Center

A setup guide and read-only Canvas course dashboard for pairing Hermes Agent with the Canvas REST API.

Canvas Command Center is a single static web page with three jobs: it explains how an AI agent (Hermes Agent) can work with Canvas LMS and Google Docs to take repetitive work out of course management, it walks you through setting that up step by step, and it gives you a dashboard for browsing your own Canvas courses. Everything is read-only. Nothing in this project changes Canvas.

<!-- TODO: add a screenshot of the Overview and Canvas dashboard tabs -->

## Features

- **Overview:** what the approach is, what you need, key cautions, and a diagram of how the pieces fit.
- **Setup guide:** phased, step-by-step instructions with copyable commands for Windows or macOS and a progress tracker saved in your browser.
- **Canvas dashboard:** search and filter your courses, then view modules, pages, assignments, discussions, quizzes, and files for one course. Page bodies open in a sandboxed preview.
- **Quick review:** flags unpublished items, assignments without due dates, empty modules, pages not linked from any module, and naming inconsistencies.
- **Demo mode:** fictional course data, so the published site works with no setup.
- **Hermes workflows:** example prompts and a Hermes skill (`hermes/skills/canvas-course-review`) for read-only course reviews.
- Light and dark color themes.

## Tech stack

| Part | Technology |
| --- | --- |
| Site | HTML, CSS, and plain JavaScript (no build step, no framework) |
| Local proxy | Node.js 18+ using only built-in modules and `fetch` (no npm packages) |
| Scripts | PowerShell 7 |
| Hosting | GitHub Pages (static files), or the local proxy itself |

## How it fits together

```text
Browser dashboard ──▶ Local proxy (127.0.0.1:8787) ──▶ Canvas REST API
Hermes Agent ───────▶   holds the token, GET only
```

- GitHub Pages serves only static files, and a Canvas token must never be in browser JavaScript. The dashboard therefore calls a **local proxy** (`proxy/server.js`) running on your computer. The proxy adds the token and forwards only allowlisted **GET** requests.
- **Hermes Agent** reads Canvas through the same proxy, so the agent never holds the token and cannot change courses.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer (for the proxy)
- PowerShell 7 (optional, for the launcher and test scripts)
- A Canvas Access Token. At Penn State, tokens have been issued through an IT Help Desk ticket since May 20, 2026 (KB0022890).

You only need the demo? Open `index.html` in a browser, go to **Canvas dashboard**, and select **Use demo data**.

### 1. Test your token (optional, read-only)

```powershell
$env:CANVAS_BASE_URL = 'https://your-school.instructure.com'
$env:CANVAS_TOKEN    = Read-Host 'Canvas token' -MaskInput
pwsh ./scripts/Test-CanvasConnection.ps1
```

This sets the token for the current terminal session only.

### 2. Configure the proxy

```powershell
Copy-Item ./proxy/.env.example ./proxy/.env
```

On macOS or Linux: `cp proxy/.env.example proxy/.env`

Then edit `proxy/.env`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `CANVAS_BASE_URL` | Yes | Your Canvas address, no trailing slash |
| `CANVAS_TOKEN` | Yes | Your Canvas Access Token |
| `PORT` | No | Proxy port (default `8787`) |
| `ALLOWED_ORIGINS` | No | Comma-separated web origins allowed to call the proxy, for example your GitHub Pages origin |
| `MAX_PAGES` | No | Maximum pages of Canvas results to follow per request (default `20`) |

> [!WARNING]
> `proxy/.env` holds your token. It is listed in `.gitignore`. Never commit it.

### 3. Start the proxy

```powershell
pwsh ./proxy/Start-Proxy.ps1
```

Or without PowerShell:

```bash
node proxy/server.js
```

### 4. Open the dashboard

Go to <http://127.0.0.1:8787/> (served by the proxy), or open your GitHub Pages site, go to **Canvas dashboard**, and select **Connect**.

## Deploy to GitHub Pages

1. Run `git status` and confirm `proxy/.env` is **not** listed.
2. Push the repository to GitHub.
3. In the repository, go to **Settings > Pages > Deploy from a branch** and choose `main` and `/ (root)`.
4. Add your Pages origin (for example `https://your-username.github.io`) to `ALLOWED_ORIGINS` in `proxy/.env`, then restart the proxy.

The `.nojekyll` file tells GitHub Pages to serve the files as they are.

## Project structure

```text
Canvas-Command-Center/
├── index.html                     # The single-page site (all five tabs)
├── assets/
│   ├── css/styles.css             # Styles (light and dark themes, responsive)
│   └── js/
│       ├── guide-data.js          # All overview and guide text: edit here to update content
│       ├── demo-data.js           # Fictional demo course data
│       ├── canvas-client.js       # Read-only data layer (proxy client and demo client)
│       ├── dashboard.js           # Dashboard UI and Quick review
│       └── app.js                 # Tabs, guide rendering, progress tracker, theme
├── proxy/
│   ├── server.js                  # Local read-only Canvas proxy
│   ├── .env.example               # Template for your private settings
│   └── Start-Proxy.ps1            # Launcher with prerequisite checks
├── scripts/
│   └── Test-CanvasConnection.ps1  # Read-only token and course-list test
└── hermes/skills/canvas-course-review/SKILL.md  # Hermes skill for course reviews
```

### Canvas API endpoints used

All requests are `GET`. The proxy rejects any path not on this list.

- `/api/v1/users/self`
- `/api/v1/courses` and `/api/v1/courses/:id`
- `/api/v1/courses/:id/modules` and `/modules/:id/items`
- `/api/v1/courses/:id/pages` and `/pages/:url_or_id`
- `/api/v1/courses/:id/assignments`
- `/api/v1/courses/:id/discussion_topics`
- `/api/v1/courses/:id/quizzes` (Classic Quizzes)
- `/api/v1/courses/:id/files`

## Security

- The token lives only in `proxy/.env` or in your terminal session. The website never asks for it.
- The proxy listens on `127.0.0.1` only, allows only `GET`, allowlists specific endpoints, limits CORS to the origins you list, and refuses to serve the `proxy/` folder or any dot-file.
- Canvas page bodies are previewed in a sandboxed iframe with scripts disabled.
- Keep student names, grades, and submissions out of AI prompts and reports.
- Before sending course content to an AI model, check your institution's policies on installing software and sharing data.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Known limitations

- Read-only by design. Writing to Canvas (starting with page edits via `PUT /api/v1/courses/:id/pages/:url`, behind a preview, review, approve, execute flow), course export backups, Google Docs sync, and bulk operations are not built yet. See **Resources > Roadmap** in the site.
- New Quizzes are not listed; the quizzes view uses the Classic Quizzes endpoint.
- The progress tracker and theme choice are stored in your browser's local storage, so they do not follow you between browsers.
- There are no automated tests.

## License

License not yet chosen. See the project owner. Until a license is added, all rights are reserved.

---

Not an Instructure resource. The demo course data is fictional.
