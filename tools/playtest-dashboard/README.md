# Private local playtest dashboard draft

Open `index.html` in a local browser. Import one or more Android trial JSON files, or a CSV produced by this tool. Files stay in this page's memory; no requests, uploads, remote fonts, analytics SDKs or browser persistence. Close/reload requires reimport. Do not publish player files with static source.

Export CSV or download an empty template from the page. Original JSON remains the source of truth; formula-like spreadsheet cells are prefixed with an apostrophe on CSV export. `payload_json` preserves original context. Exported record IDs support duplicate-file import, not identity/authentication. Large campaigns need the future authenticated backend, not this in-memory tool.

Old reports cannot measure active playtime, unique people, exact stage dwell, retention or current online players. Missing values stay unknown. Future imports need cumulative session `active_seconds`, optional consented random `install_id`, and non-overlapping `phase_interval` event durations. Text themes are keyword triage with visible limitations, not AI semantic analysis.

Test: `node scripts/android/check-dashboard.cjs`. CLI conversion: `node scripts/android/feedback-to-csv.cjs report.json > feedback.csv`.

Design, realtime architecture, questionnaire and acquisition plan: [docs/playtest-dashboard-and-acquisition.md](../../docs/playtest-dashboard-and-acquisition.md). Browser preview connection failed this turn; visual and actual import/export interactions are not signed off. This is not a deployed production dashboard.
