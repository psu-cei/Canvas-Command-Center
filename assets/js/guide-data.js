/* File: assets/js/guide-data.js
 * Content for the Overview, Setup guide, Hermes, and Resources tabs.
 * source: 'session' = shared in the session chat; 'docs' = official documentation;
 *         'project' = this project's own design (dashboard/proxy).
 * badge:  'read' = READ ONLY, 'modifies' = MODIFIES CANVAS, null = local setup only.
 */
window.CCC_CONTENT = {
  sessionLinks: [
    { label: 'Hermes Agent', url: 'https://hermes-agent.org/' },
    { label: 'Install PowerShell on Windows (Microsoft Learn)', url: 'https://learn.microsoft.com/en-us/powershell/scripting/install/install-powershell-on-windows?view=powershell-7.6' },
    { label: 'Canvas Access Token — Penn State KB0022890', url: 'https://pennstate.service-now.com/sp?id=kb_article_view&sysparm_article=KB0022890' },
    { label: 'Google Voice', url: 'https://voice.google.com/' },
    { label: 'Penn State Course Insights (learning analytics)', url: 'https://www.it.psu.edu/learning-analytics/course-insights/' },
    { label: 'Convivial Machine Learning — DHSI 2026', url: 'https://dhsi.org/2025/09/30/convivial-machine-learning-dhsi-2026/' },
  ],

  docLinks: [
    { label: 'Hermes Agent docs — Installation', url: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation' },
    { label: 'Hermes Agent — Google Gemini / AI Studio provider', url: 'https://hermes-agent.nousresearch.com/docs/guides/google-gemini' },
    { label: 'Hermes Agent — Skills', url: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/skills' },
    { label: 'Hermes Agent — MCP servers', url: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp' },
    { label: 'Hermes Agent — FAQ & troubleshooting', url: 'https://hermes-agent.nousresearch.com/docs/reference/faq' },
    { label: 'Hermes Agent source (GitHub)', url: 'https://github.com/NousResearch/hermes-agent' },
    { label: 'Penn State IT — Canvas personal access tokens change', url: 'https://www.it.psu.edu/news/canvas/canvas-personal-access-tokens/' },
    { label: 'Canvas REST API documentation', url: 'https://canvas.instructure.com/doc/api/' },
    { label: 'Canvas API — Pagination', url: 'https://canvas.instructure.com/doc/api/file.pagination.html' },
    { label: 'Google AI Studio — API keys', url: 'https://aistudio.google.com/apikey' },
    { label: 'GitHub Pages — publishing source', url: 'https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site' },
  ],

  phases: [
    { id: 'p1', title: 'Prepare' },
    { id: 'p2', title: 'Install Hermes Agent' },
    { id: 'p3', title: 'Canvas API access' },
    { id: 'p4', title: 'Run the dashboard' },
    { id: 'p5', title: 'Connect Hermes to Canvas' },
  ],

  steps: [
    // ---------------- Phase 1 ----------------
    {
      id: 's1', phase: 'p1', title: 'Sort out permissions and pick a test course', source: 'session', badge: null,
      why: 'Attendees asked about approval processes. Settle them before installing anything, so a policy question doesn\'t stall you halfway through.',
      body: `<ul>
        <li><strong>Software install:</strong> ask your unit IT whether you can install PowerShell 7, Node.js, and Hermes Agent on your work computer.</li>
        <li><strong>Canvas token:</strong> at Penn State you can no longer create tokens yourself (changed May 20, 2026). Submit an IT Help Desk ticket requesting a Canvas personal access token; see KB0022890. Start this early, since it can take time.</li>
        <li><strong>AI and course data:</strong> confirm which AI services are approved for course content. Keep student names, grades, and submissions out of prompts.</li>
        <li><strong>Test course:</strong> ask for (or use) a sandbox/development course. Test everything there before you touch a live course.</li>
      </ul>`,
      commands: [],
      verify: 'You have a ticket number for the token request and the ID of a sandbox course you can safely use.',
    },
    {
      id: 's2', phase: 'p1', title: 'Install PowerShell 7', source: 'session', badge: null,
      why: 'PowerShell was part of the session toolkit. Version 7 runs on Windows and macOS and includes Invoke-RestMethod -FollowRelLink, which handles Canvas pagination for you.',
      body: '<p>Windows ships with the older Windows PowerShell 5.1. Install PowerShell 7 alongside it; its command is <code>pwsh</code>.</p>',
      commands: [
        { os: 'windows', shell: 'Command Prompt or Windows PowerShell', code: 'winget install --id Microsoft.PowerShell --source winget' },
        { os: 'mac', shell: 'Terminal (requires Homebrew)', code: 'brew install --cask powershell' },
        { os: 'any', shell: 'Then open PowerShell 7', code: 'pwsh\n$PSVersionTable.PSVersion' },
      ],
      verify: '<code>$PSVersionTable.PSVersion</code> shows Major 7.',
    },
    {
      id: 's3', phase: 'p1', title: 'Install Git and Node.js LTS', source: 'project', badge: null,
      why: 'Git puts the dashboard on GitHub. Node.js runs the small local proxy that keeps your Canvas token off the web page. It uses no extra packages.',
      body: '<p>Node.js is the one technology added beyond the session\'s toolkit. A static GitHub Pages site can\'t hold a secret, so a local helper is needed to add the token to Canvas requests.</p>',
      commands: [
        { os: 'windows', shell: 'PowerShell 7', code: 'winget install --id Git.Git --source winget\nwinget install --id OpenJS.NodeJS.LTS --source winget' },
        { os: 'mac', shell: 'Terminal', code: 'brew install git node' },
        { os: 'any', shell: 'Close and reopen the terminal, then', code: 'git --version\nnode --version' },
      ],
      verify: '<code>node --version</code> prints v18 or newer.',
    },

    // ---------------- Phase 2 ----------------
    {
      id: 's4', phase: 'p2', title: 'Install Hermes Agent', source: 'session', badge: null,
      why: 'Hermes Agent (by Nous Research, MIT-licensed) is the AI agent layer. It runs on your machine and keeps its settings, memory, and skills locally in ~/.hermes/.',
      body: `<p>These are the official one-line installers. Before running a script you downloaded, read it; the Hermes docs link to the script source.</p>
        <p class="note">Windows: the docs list a native PowerShell installer, and older pages call native Windows "experimental" and recommend WSL2. If the native install gives you trouble, install WSL2 (<code>wsl --install</code>) and use the Linux command inside it.</p>`,
      commands: [
        { os: 'windows', shell: 'PowerShell 7', code: 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)' },
        { os: 'mac', shell: 'Terminal', code: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash\nsource ~/.zshrc' },
        { os: 'any', shell: 'Check the install', code: 'hermes doctor' },
      ],
      verify: '<code>hermes doctor</code> finishes and only reports items you haven\'t configured yet, such as a model provider.',
    },
    {
      id: 's5', phase: 'p2', title: 'Connect an AI model (Google AI Studio example)', source: 'docs', badge: null,
      why: 'Hermes needs a language model. The project description mentions AI Studio; Hermes supports Google AI Studio (Gemini) directly, along with Nous Portal, OpenRouter, and others.',
      body: `<ol>
        <li>Create an API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (use an account your institution approves).</li>
        <li>Run <code>hermes model</code>, choose <em>More providers… → Google AI Studio</em>, and paste the key when asked. Hermes stores it in <code>~/.hermes/.env</code>, not in your project.</li>
        <li>Pick a model from the list Hermes shows. Available Gemini models change over time, so don't copy a model name from an old tutorial.</li>
      </ol>`,
      commands: [
        { os: 'any', shell: 'Terminal', code: 'hermes model' },
      ],
      verify: 'Running <code>hermes</code> and asking “What model are you using?” gets a reply.',
    },
    {
      id: 's6', phase: 'p2', title: 'First conversation and command approval', source: 'docs', badge: null,
      why: 'Get comfortable with how Hermes asks permission before it runs potentially destructive commands. The same safeguard matters once it can reach Canvas.',
      body: '<p>Start Hermes and give it a harmless task. When it wants to run a risky terminal command, it shows you the exact command and waits for you to type <code>y</code>. Read each one before approving.</p>',
      commands: [
        { os: 'any', shell: 'Terminal', code: 'hermes\n# then try:  List the files in my Documents folder and summarize what kinds of files are there.' },
      ],
      verify: 'You\'ve seen at least one approval prompt and know how to approve or decline it.',
    },
    {
      id: 's7', phase: 'p2', title: 'Optional: message Hermes from your phone', source: 'session', badge: null,
      why: 'Hermes has a messaging gateway (Telegram, Discord, Slack, WhatsApp, Signal, Email). Google Voice was shared in the session chat. A likely use is a separate phone number for the agent, but the chat doesn\'t say for sure.',
      body: '<p>Skip this until the rest works. The gateway makes the agent reachable from outside your computer, so enable DM pairing and keep command approval on.</p>',
      commands: [
        { os: 'any', shell: 'Terminal', code: 'hermes gateway setup\nhermes gateway' },
      ],
      verify: 'A test message from your phone gets a reply, and only paired accounts can talk to the agent.',
    },

    // ---------------- Phase 3 ----------------
    {
      id: 's8', phase: 'p3', title: 'Receive and store your Canvas token safely', source: 'session', badge: null,
      why: 'The token acts as you in Canvas, with your permissions in every course you teach. Treat it like a password.',
      body: `<ul>
        <li>Once the Help Desk provides the token, keep it only in <code>proxy/.env</code> (created in step 13) or in a password manager.</li>
        <li>Never paste it into the web page, GitHub, a Google Doc, a screenshot, or an AI chat.</li>
        <li>If it leaks, ask for it to be revoked right away.</li>
      </ul>
      <p>For quick tests, load it into your terminal session only. Nothing is written to disk:</p>`,
      commands: [
        { os: 'any', shell: 'PowerShell 7', code: "$env:CANVAS_BASE_URL = 'https://[PLACEHOLDER].instructure.com'\n$env:CANVAS_TOKEN    = Read-Host 'Canvas token' -MaskInput" },
      ],
      verify: '<code>$env:CANVAS_TOKEN.Length</code> prints a number greater than 0, and the token itself never appears on screen.',
    },
    {
      id: 's9', phase: 'p3', title: 'Test the connection', source: 'docs', badge: 'read',
      why: 'Confirm that the token and URL work before you build anything on top of them.',
      body: `<p><strong>Endpoint:</strong> <code>GET /api/v1/users/self</code> returns the profile the token belongs to. Any role can call it.</p>
        <p>Run the included script from the repository folder (step 11), or paste the one-liner:</p>`,
      commands: [
        { os: 'any', shell: 'PowerShell 7 (same window as step 8)', code: "Invoke-RestMethod -Uri \"$env:CANVAS_BASE_URL/api/v1/users/self\" -Headers @{ Authorization = \"Bearer $env:CANVAS_TOKEN\" }" },
        { os: 'any', shell: 'Or, from the repo folder', code: 'pwsh ./scripts/Test-CanvasConnection.ps1' },
      ],
      verify: 'Your name and Canvas user ID are printed. A 401 means the token is wrong or expired; a 404 usually means the base URL is wrong.',
    },
    {
      id: 's10', phase: 'p3', title: 'List your courses (with pagination)', source: 'docs', badge: 'read',
      why: 'Canvas returns long lists in pages (10 items by default). You have to follow the Link header or you\'ll miss courses.',
      body: `<p><strong>Endpoint:</strong> <code>GET /api/v1/courses?enrollment_state=active&amp;per_page=100</code></p>
        <ul><li><code>enrollment_state=active</code>: only courses where your enrollment is active.</li>
        <li><code>per_page=100</code>: ask for up to 100 per page. Canvas may cap this.</li>
        <li><code>-FollowRelLink</code>: PowerShell 7 follows <code>rel="next"</code> links automatically.</li></ul>`,
      commands: [
        { os: 'any', shell: 'PowerShell 7', code: "$h = @{ Authorization = \"Bearer $env:CANVAS_TOKEN\" }\n$pages = Invoke-RestMethod -Uri \"$env:CANVAS_BASE_URL/api/v1/courses?enrollment_state=active&per_page=100\" -Headers $h -FollowRelLink\n$pages | ForEach-Object { $_ } | Select-Object id, course_code, name | Format-Table" },
      ],
      verify: 'Your sandbox course appears. Write down its numeric <code>id</code>; you\'ll use real IDs from here on, never guessed ones.',
    },

    // ---------------- Phase 4 ----------------
    {
      id: 's11', phase: 'p4', title: 'Put the dashboard in a GitHub repository', source: 'project', badge: null,
      why: 'GitHub Pages serves the dashboard\'s HTML/CSS/JS for free. Keep the working copy in ~/Code, not Google Drive, so sync conflicts don\'t corrupt the Git folder.',
      body: `<ol><li>Create an empty repository on github.com named <code>canvas-command-center</code>. Don't add a README.</li>
        <li>Copy this project folder to <code>~/Code/canvas-command-center</code>.</li>
        <li>Run the commands below. <strong>Before committing, check that <code>git status</code> does not list <code>proxy/.env</code>.</strong></li></ol>`,
      commands: [
        { os: 'any', shell: 'Terminal / PowerShell 7', code: 'cd ~/Code/canvas-command-center\ngit init -b main\ngit add .\ngit status\ngit commit -m "Canvas Command Center v1"\ngit remote add origin https://github.com/[PLACEHOLDER-username]/canvas-command-center.git\ngit push -u origin main' },
      ],
      verify: 'The files show on GitHub and there is no <code>.env</code> file among them.',
    },
    {
      id: 's12', phase: 'p4', title: 'Turn on GitHub Pages', source: 'docs', badge: null,
      why: 'Publishes the guide and dashboard at https://[username].github.io/canvas-command-center/.',
      body: '<p>In the repository: <em>Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main, folder: / (root) → Save</em>. The included <code>.nojekyll</code> file tells GitHub to serve the files as they are.</p>',
      commands: [],
      verify: 'After a minute or two, the Pages URL shows this site. The dashboard\'s <em>Use demo data</em> button works there.',
    },
    {
      id: 's13', phase: 'p4', title: 'Configure and start the local proxy', source: 'project', badge: 'read',
      why: 'The proxy runs on 127.0.0.1, adds your token to Canvas requests, and allows only allowlisted GET endpoints. It\'s the only piece that ever sees the token.',
      body: `<ol><li>Create <code>proxy/.env</code> from the example and fill in <code>CANVAS_BASE_URL</code> and <code>CANVAS_TOKEN</code>.</li>
        <li>If you'll use the GitHub Pages copy, set <code>ALLOWED_ORIGINS=https://[username].github.io</code> (origin only, no path).</li>
        <li>Start it and leave that terminal open.</li></ol>`,
      commands: [
        { os: 'any', shell: 'PowerShell 7 (repo folder)', code: 'Copy-Item ./proxy/.env.example ./proxy/.env\n# edit proxy/.env in a text editor, then:\npwsh ./proxy/Start-Proxy.ps1' },
        { os: 'any', shell: 'Or directly with Node', code: 'node proxy/server.js' },
      ],
      verify: 'Visiting <code>http://127.0.0.1:8787/health</code> shows <code>{"ok":true,"mode":"read-only",…}</code>.',
    },
    {
      id: 's14', phase: 'p4', title: 'Open the dashboard and explore your sandbox course', source: 'project', badge: 'read',
      why: 'Checks the whole chain: browser → proxy → Canvas.',
      body: `<p>Two ways to open it:</p>
        <ul><li><strong>Easiest:</strong> <code>http://127.0.0.1:8787/</code>. The proxy serves the dashboard itself, with no cross-site setup.</li>
        <li><strong>From GitHub Pages:</strong> open your Pages URL, go to <em>Canvas dashboard</em>, and click <em>Connect</em>. Chrome may ask to allow access to devices on your local network; allow it for this site. Safari may block HTTPS pages from calling localhost, so use the first option there.</li></ul>
        <p>Select your sandbox course and browse Modules, Pages, Assignments, Discussions, Quizzes, and Files, then try <em>Quick review</em>.</p>`,
      commands: [],
      verify: 'Your courses load, and the sandbox course\'s modules match what you see in Canvas.',
    },

    // ---------------- Phase 5 ----------------
    {
      id: 's15', phase: 'p5', title: 'Install the canvas-course-review skill', source: 'project', badge: 'read',
      why: 'Skills are how Hermes learns a procedure. This one tells it to read Canvas only through the local proxy, so the agent never holds the token and can\'t make changes.',
      body: '<p>Copy the skill folder from this repository into Hermes\'s skills directory, then start a new Hermes session.</p>',
      commands: [
        { os: 'windows', shell: 'PowerShell 7 (repo folder)', code: 'New-Item -ItemType Directory -Force "$HOME/.hermes/skills" | Out-Null\nCopy-Item -Recurse ./hermes/skills/canvas-course-review "$HOME/.hermes/skills/"\nhermes skills list' },
        { os: 'mac', shell: 'Terminal (repo folder)', code: 'mkdir -p ~/.hermes/skills\ncp -R hermes/skills/canvas-course-review ~/.hermes/skills/\nhermes skills list' },
      ],
      verify: '<code>canvas-course-review</code> appears in <code>hermes skills list</code>. On native Windows, if it doesn\'t, check whether your Hermes home is <code>%LOCALAPPDATA%\\hermes</code> instead.',
    },
    {
      id: 's16', phase: 'p5', title: 'Run a read-only course review with Hermes', source: 'project', badge: 'read',
      why: 'This is the payoff shown in the session: the agent does the tedious checking, and you make the decisions.',
      body: '<p>With the proxy running, start Hermes and call the skill. Use your real sandbox course ID from step 10. Review the report before acting on it. Every proposed change is labeled <span class="badge badge-mod">MODIFIES CANVAS</span> and is only a suggestion.</p>',
      commands: [
        { os: 'any', shell: 'Terminal', code: 'hermes\n# then:\n/canvas-course-review Review course [PLACEHOLDER-course-id]: list unpublished modules and items, assignments with no due date, and empty modules. Save the report as course-review_[PLACEHOLDER-course-id]_v1.md' },
      ],
      verify: 'The report cites real IDs, lists the endpoints it queried, and contains no student information.',
    },
  ],

  hermesCards: [
    { title: 'Retrieve and summarize', text: 'Pull a course\'s modules, pages, and assignments and summarize its structure week by week.' },
    { title: 'Find gaps', text: 'Flag unpublished content, assignments without due dates or points, empty modules, and pages not linked from any module.' },
    { title: 'Compare courses', text: 'Line up two sections or two semesters and list differences in modules, naming, and assignment settings.' },
    { title: 'Draft, don\'t push', text: 'Write proposed wording or structure changes to a Google Doc or Markdown file for you to review. Writing back to Canvas is a later phase and always goes preview → review → approve → execute.' },
  ],

  prompts: [
    '/canvas-course-review Summarize course [PLACEHOLDER-course-id] module by module in a table: module name, published state, item count, item types.',
    '/canvas-course-review In course [PLACEHOLDER-course-id], list every assignment missing a due date or with 0 points, sorted by module.',
    '/canvas-course-review Compare the module names and order of courses [PLACEHOLDER-id-A] and [PLACEHOLDER-id-B] and list the differences.',
    '/canvas-course-review Find naming inconsistencies across modules and pages in course [PLACEHOLDER-course-id] (e.g., "Week 1" vs "Wk 2") and propose a consistent scheme. Do not change anything in Canvas.',
  ],

  endpoints: [
    ['GET', '/api/v1/users/self', 'Token owner (connection test)'],
    ['GET', '/api/v1/courses', 'Your courses (paginated)'],
    ['GET', '/api/v1/courses/:id', 'One course\'s details'],
    ['GET', '/api/v1/courses/:id/modules?include[]=items', 'Modules with their items'],
    ['GET', '/api/v1/courses/:id/pages', 'Page list'],
    ['GET', '/api/v1/courses/:id/pages/:url', 'One page, including its HTML body'],
    ['GET', '/api/v1/courses/:id/assignments', 'Assignments'],
    ['GET', '/api/v1/courses/:id/discussion_topics', 'Discussions & announcements'],
    ['GET', '/api/v1/courses/:id/quizzes', 'Classic Quizzes (New Quizzes are not listed here)'],
    ['GET', '/api/v1/courses/:id/files', 'Files (needs file-management rights)'],
  ],

  roadmap: [
    '<strong>Back up first:</strong> start a course export before any writes: <code>POST /api/v1/courses/:id/content_exports</code> <span class="badge badge-mod">MODIFIES CANVAS</span> (creates an export; changes no content).',
    '<strong>Edit one safe content type:</strong> Canvas pages via <code>PUT /api/v1/courses/:id/pages/:url</code> <span class="badge badge-mod">MODIFIES CANVAS</span>, with a diff preview, confirmation, and a check of the response. Canvas keeps page revisions, so this change can be reversed.',
    '<strong>Google Docs → Canvas:</strong> one-way, one page at a time, only after explicit approval. Never an automatic overwrite.',
    '<strong>Hermes proposals queue:</strong> Hermes writes proposed changes, the dashboard shows them for approval, and the proxy applies approved ones.',
    '<strong>Bulk operations:</strong> only after single edits are reliable, with a count of affected objects and a backup.',
  ],
};
