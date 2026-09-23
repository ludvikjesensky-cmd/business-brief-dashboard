# Business Brief Control Room

**Version:** v0.1  
**Updated:** 23. 9. 2026  
**Status:** deployed on Railway

Read-only dashboard for monitoring the Business Brief processing pipeline.

## What it shows

- current FT / WSJ / Handelsblatt editions;
- Technician → Ingestor → Assembler stage state;
- stage-based progress;
- elapsed time;
- latest-run blocking and nonblocking findings;
- activity stream;
- known article identities and latest revisions;
- source/article metrics where available.

## Production URL

`https://business-brief-dashboard-production.up.railway.app`

The UI and `/api/dashboard` are protected by HTTP Basic Auth.

Credentials are stored only in Railway environment variables and must never be committed.

## Architecture

The dashboard is intentionally read-only.

Browser:

`Browser → Node server → PostgreSQL views`

The browser never receives database credentials.

Before every dashboard query the server executes:

`SET ROLE brief_dashboard`

and opens:

`BEGIN READ ONLY`

The `brief_dashboard` role has SELECT access only to:

- `brief.dashboard_editions`
- `brief.dashboard_findings`
- `brief.dashboard_articles`
- `brief.dashboard_activity`
- `brief.dashboard_kpis`

The canonical view definitions and migrations live in the main repository:

`ludvikjesensky-cmd/business-brief`

## Runtime

- Node.js 22
- `pg`
- Docker
- Railway
- port 3000
- healthcheck `/health`
- IPv6 egress enabled
- refresh interval 15 seconds

## Environment

Required:

- `DATABASE_URL`

Authentication:

- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`

Other:

- `DB_SSL=true`
- `REFRESH_SECONDS=15`
- Railway `PORT`

## Security model

Current v0.1:

- no Supabase secret key in the app;
- no DB credentials in browser code;
- Basic Auth at HTTP layer;
- dashboard query path switches to read-only `brief_dashboard`;
- read-only transaction;
- no mutation endpoint.

### Known hardening debt

The underlying DB connection currently uses an existing restricted worker login that can assume `brief_dashboard`.

The stronger target model is a dedicated dashboard login with no worker write privileges.

The GitHub repository is currently public. It contains no secrets, but if the app is intended to remain purely internal, changing repository visibility to private is recommended.

## Current data semantics

### Findings

`dashboard_findings` returns findings only from the latest assembly run for each source file.

Historical findings remain in the canonical tables but do not poison the current dashboard semaphore.

### Articles

Important v0.1 nuance:

`dashboard_editions.unique_articles` is a source-level historical count of stable article identities, not a count created exclusively by the latest assembly run.

Therefore Handelsblatt may show one known article identity even though the latest Assembler v21 run created zero articles.

For exact latest-run article output, use:

- `assembly_runs.metrics.articles_created`;
- `article_versions.assembly_run_id`.

This is planned for correction in v0.2.

## Current snapshot

Latest Assembler v21 runs:

### FT

- completed_unverified
- articles_created: 1
- blocking findings: 0
- warnings: 0

### Handelsblatt

- completed_unverified
- articles_created: 0
- blocking findings: 0
- warnings: 1
- known regression: previously validated implicit 40→41 continuation is not reproduced by v21

### WSJ

- completed_unverified
- articles_created: 5
- blocking findings: 0
- warnings: 14

## API

### `GET /`

Dashboard UI.

### `GET /api/dashboard`

Read-only JSON payload for the UI.

### `GET /health`

Public healthcheck with no business data.

## Progress model

v0.1 progress is stage-based, not granular runtime telemetry.

It can tell whether the document is:

- received;
- prepared;
- ingest queued/running/complete;
- assembly queued/running/complete.

It cannot yet reliably show:

- page 27/48;
- article 3/12;
- OCR 9/18 pages.

## v0.2

Planned:

- `brief.run_events`;
- true granular progress;
- latest-run article counts;
- live elapsed stage time;
- run detail;
- finding detail;
- drill-down links.

## v0.3

Possible control actions:

- accept/reject continuation candidate;
- resolve finding;
- retry failed run;
- rerun role.

These must use a separate authorized write API with audit logging and idempotency. They must not reuse the read-only query path.
