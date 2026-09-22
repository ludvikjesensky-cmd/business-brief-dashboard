# Business Brief Control Room

Read-only dashboard pro sledování pipeline Business Brief.

## Co ukazuje

- aktuální FT / WSJ / Handelsblatt a průchod Technician → Ingestor → Assembler;
- stav a orientační progres jednotlivých rolí;
- blocking a nonblocking findings;
- nejnovější články a jejich revisions;
- poslední activity stream;
- časy Ingestoru a Assembleru;
- počty bloků, znaků a článků, pokud jsou k dispozici.

## Architektura

Dashboard je záměrně read-only. Railway předá serveru existující omezené PostgreSQL spojení, ale každá dashboard query nejdřív provede `SET ROLE brief_dashboard`. Tato role má pouze SELECT na view:

- `brief.dashboard_editions`
- `brief.dashboard_findings`
- `brief.dashboard_articles`
- `brief.dashboard_activity`
- `brief.dashboard_kpis`

Browser nikdy nedostane databázové credentials.

## Environment

Viz `.env.example`.

Povinné:

- `DATABASE_URL`

Doporučené pro veřejně dostupný Railway endpoint:

- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`

Další:

- `DB_SSL=true`
- `REFRESH_SECONDS=15`

## Railway

Dockerfile je připravený pro Railway.

Healthcheck:

`/health`

Server poslouchá na `PORT`.

## Bezpečnost

- dashboard nepoužívá `SUPABASE_SECRET_KEY`;
- před každou dashboard query přepíná DB session na samostatnou read-only roli `brief_dashboard`;
- všechny SQL view jsou spravované v hlavním `business-brief` repo;
- UI nemá žádné mutation endpointy;
- Basic Auth je první interní ochranná vrstva.

## Další fáze

v0.2:

- `run_events` a skutečný granular progress;
- live elapsed time;
- detail runu a detail findingu.

v0.3:

- explicitní kontrolní akce (accept/reject finding, retry/rerun);
- audit log uživatelských zásahů.
