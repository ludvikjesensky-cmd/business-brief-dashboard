# Business Brief Control Room

Read-only dashboard pro sledování pipeline Business Brief.

**Aktuální stav:** v0.1 je nasazené na Railway a čte živá data ze Supabase PostgreSQL.

Web:

`https://business-brief-dashboard-production.up.railway.app`

Dashboard ukazuje FT / WSJ / Handelsblatt, stav Technician → Ingestor → Assembler, findings, activity stream, elapsed times a latest article revisions.

Refresh je 15 s. Progress v0.1 je stage-based, ne přesné procento práce.

Datový kontrakt tvoří view:

- `brief.dashboard_editions`
- `brief.dashboard_findings`
- `brief.dashboard_articles`
- `brief.dashboard_activity`
- `brief.dashboard_kpis`

Browser nemá přímý přístup do databáze. Dashboard je v0.1 read-only.

Hlavní technická dokumentace projektu je v `business-brief/docs/`, zejména:

- `DASHBOARD.md`
- `STATUS.md`
- `ARCHITECTURE.md`
- `DEPLOYMENT.md`

Další plán:

- v0.2: granular `run_events` a skutečný live progress
- v0.3: případné kontrolní akce pouze přes oddělenou auditovanou vrstvu
