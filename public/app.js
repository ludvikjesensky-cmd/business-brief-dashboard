const $ = (id) => document.getElementById(id);
let refreshTimer;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function n(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function dateKey(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const key = dateKey(value);
  if (!key) return '—';
  const [year, month, day] = key.split('-');
  return `${day}. ${month}. ${year}`;
}

function formatTime(ts) {
  if (!ts) return '—';
  const parsed = new Date(ts);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('cs-CZ', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(parsed);
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Number(seconds));
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${m}m ${rest}s`;
}

function statusClass(state) {
  if (['complete','completed_unverified','ready','extracted_unverified'].includes(state)) return 'complete';
  if (['warning','needs_review'].includes(state)) return 'warning';
  if (['error','failed'].includes(state)) return 'error';
  if (state === 'running') return 'running';
  return state || 'queued';
}

function humanState(state) {
  const map = {
    complete:'hotovo', warning:'pozornost', error:'chyba', running:'běží', queued:'čeká',
    prepared:'prepared', ingested:'ingested', received:'přijato', ready:'ready',
    completed_unverified:'completed', extracted_unverified:'extracted', needs_review:'needs review', failed:'failed'
  };
  return map[state] || state || '—';
}

function stageProgress(e) {
  if (e.assembly_status === 'completed_unverified' || e.assembly_status === 'needs_review') return 100;
  if (e.assembly_status === 'running') return 86;
  if (e.assembly_status === 'queued') return 74;
  if (e.ingest_status === 'extracted_unverified' || e.ingest_status === 'needs_review') return 66;
  if (e.ingest_status === 'running') return 52;
  if (e.ingest_status === 'queued') return 40;
  if (e.prepared_document_id) return 33;
  return 8;
}

function latestDate(editions) {
  return editions.map(e => dateKey(e.publication_date)).filter(Boolean).sort().at(-1) || null;
}

function metric(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function renderKpis(data, dayEditions, dayFindings, dayArticles) {
  const active = dayEditions.filter(e => ['running','queued'].includes(e.overall_state)).length;
  const blocking = dayFindings.filter(f => f.blocking).length;
  const warnings = dayFindings.filter(f => !f.blocking).length;
  const cards = [
    ['Vydání', dayEditions.length, 'v aktuálním dni'],
    ['Aktivní', active, active ? 'pipeline pracuje' : 'nic neběží'],
    ['Blocking', blocking, blocking ? 'vyžaduje zásah' : 'bez červených chyb'],
    ['Warnings', warnings, 'neblokující findings'],
    ['Články', dayArticles.length, 'unikátní latest revisions'],
  ];
  $('kpis').innerHTML = cards.map(([label,value,sub]) => `
    <div class="kpi">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${esc(value)}</div>
      <div class="kpi-sub">${esc(sub)}</div>
    </div>`).join('');
}

function renderEditions(editions, date) {
  $('edition-heading').textContent = date ? `Vydání ${formatDate(date)}` : 'Aktuální vydání';
  if (!editions.length) {
    $('editions').innerHTML = '<div class="empty">Žádná vydání.</div>';
    return;
  }
  $('editions').innerHTML = editions.map(e => {
    const chars = metric(e.ingest_metrics, 'chars');
    const blocks = metric(e.ingest_metrics, 'blocks');
    const pages = e.page_count || metric(e.ingest_metrics, 'pages');
    return `
      <article class="edition">
        <div class="edition-top">
          <div>
            <div class="pub">${esc(String(e.publication_code || '').toUpperCase())}</div>
            <div class="edition-meta">${esc(e.edition_label || '')} · ${esc(e.original_name || '')}</div>
          </div>
          <span class="state ${statusClass(e.overall_state)}">${esc(humanState(e.overall_state))}</span>
        </div>
        <div class="progress"><div style="width:${stageProgress(e)}%"></div></div>
        <div class="stages">
          <div class="stage">
            <div class="stage-name">Technician</div>
            <div class="stage-status">${e.prepared_document_id ? '✓ ' + esc(e.preparation_method || 'prepared') : 'čeká'}</div>
            <div class="stage-detail">${pages ? `${esc(pages)} stran` : '—'}${e.ocr_language ? ` · OCR ${esc(e.ocr_language)}` : ''}</div>
          </div>
          <div class="stage">
            <div class="stage-name">Ingestor</div>
            <div class="stage-status">${esc(humanState(e.ingest_status))}</div>
            <div class="stage-detail">${formatDuration(e.ingest_elapsed_seconds)}${blocks ? ` · ${Number(blocks).toLocaleString('cs-CZ')} bloků` : ''}</div>
          </div>
          <div class="stage">
            <div class="stage-name">Assembler</div>
            <div class="stage-status">${esc(humanState(e.assembly_status))}</div>
            <div class="stage-detail">${formatDuration(e.assembly_elapsed_seconds)} · ${n(e.unique_articles)} článků</div>
          </div>
        </div>
        <div class="edition-footer">
          <span>${n(e.blocking_finding_count)} blocking / ${n(e.nonblocking_finding_count)} warning</span>
          <span>${chars ? `${Number(chars).toLocaleString('cs-CZ')} znaků` : ''}</span>
        </div>
      </article>`;
  }).join('');
}

function renderFindings(findings) {
  $('finding-count').textContent = String(findings.length);
  if (!findings.length) {
    $('findings').innerHTML = '<div class="empty">Žádné findings pro aktuální vydání. Krásné ticho.</div>';
    return;
  }
  $('findings').innerHTML = findings.map(f => `
    <div class="finding ${f.blocking ? 'blocking' : ''}">
      <div class="finding-dot"></div>
      <div>
        <div class="finding-title">${esc(String(f.publication_code || '').toUpperCase())} · ${esc(f.code)}</div>
        <div class="finding-detail">${esc(f.detail)}</div>
      </div>
      <div class="finding-side">${f.page_no ? `str. ${esc(f.page_no)}` : ''}<br>${formatTime(f.created_at)}</div>
    </div>`).join('');
}

function eventLabel(event) {
  const labels = {
    source_received:'PDF přijato', prepared:'Technician hotov', finding:'Finding', article:'Článek sestaven',
    ingest_running:'Ingestor běží', ingest_extracted_unverified:'Ingestor hotov', ingest_failed:'Ingestor selhal',
    assembly_running:'Assembler běží', assembly_completed_unverified:'Assembler hotov', assembly_needs_review:'Assembler needs review', assembly_failed:'Assembler selhal'
  };
  return labels[event.event_type] || event.event_type?.replaceAll('_',' ') || 'Událost';
}

function renderActivity(activity) {
  if (!activity.length) {
    $('activity').innerHTML = '<div class="empty">Žádná aktivita.</div>';
    return;
  }
  $('activity').innerHTML = activity.slice(0,28).map(e => `
    <div class="event">
      <div class="event-time">${formatTime(e.event_at)}</div>
      <div class="event-line"><span></span></div>
      <div class="event-body">
        <div class="event-title">${esc(String(e.publication_code || '').toUpperCase())} · ${esc(eventLabel(e))}</div>
        <div class="event-detail">${esc(e.title || '')}${e.detail ? ` · ${esc(e.detail)}` : ''}</div>
      </div>
    </div>`).join('');
}

function renderArticles(articles) {
  $('article-count').textContent = String(articles.length);
  if (!articles.length) {
    $('articles').innerHTML = '<tr><td colspan="6" class="empty">Žádné články.</td></tr>';
    return;
  }
  $('articles').innerHTML = articles.map(a => {
    const pages = a.first_page ? (a.first_page === a.last_page ? `${a.first_page}` : `${a.first_page}→${a.last_page}`) : '—';
    const statusClassName = a.status === 'draft' ? 'warn' : 'ok';
    return `<tr>
      <td>${esc(String(a.publication_code || '').toUpperCase())}<div class="article-author">${esc(formatDate(a.publication_date))}</div></td>
      <td><div class="article-title">${esc(a.title || 'Untitled article')}</div><div class="article-author">${esc(a.author || 'autor neurčen')}</div></td>
      <td>${esc(pages)}</td>
      <td>${esc(a.revision)} / ${esc(a.revision_count)}</td>
      <td>${Number(a.body_chars || 0).toLocaleString('cs-CZ')} znaků<div class="article-author">${Number(a.provenance_blocks || 0).toLocaleString('cs-CZ')} bloků</div></td>
      <td><span class="status-text ${statusClassName}">${esc(a.status || '—')}</span></td>
    </tr>`;
  }).join('');
}

async function load() {
  clearTimeout(refreshTimer);
  $('refresh').disabled = true;
  try {
    const response = await fetch('/api/dashboard', { cache:'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    document.querySelectorAll('.error-banner').forEach(n => n.remove());

    const date = latestDate(data.editions || []);
    const dayEditions = (data.editions || []).filter(e => dateKey(e.publication_date) === date);
    const dayFindings = (data.findings || []).filter(f => dateKey(f.publication_date) === date);
    const dayArticles = (data.articles || []).filter(a => dateKey(a.publication_date) === date);
    const dayActivity = (data.activity || []).filter(a => dateKey(a.publication_date) === date);

    renderKpis(data, dayEditions, dayFindings, dayArticles);
    renderEditions(dayEditions, date);
    renderFindings(dayFindings);
    renderActivity(dayActivity);
    renderArticles(dayArticles);
    $('updated').textContent = `aktualizováno ${formatTime(data.generatedAt)}`;

    refreshTimer = setTimeout(load, Math.max(5, Number(data.refreshSeconds || 15)) * 1000);
  } catch (error) {
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = `Dashboard se nepodařilo načíst: ${error.message}`;
    document.querySelector('.shell').insertBefore(banner, document.querySelector('.kpis'));
    $('updated').textContent = 'offline';
    refreshTimer = setTimeout(load, 15000);
  } finally {
    $('refresh').disabled = false;
  }
}

$('refresh').addEventListener('click', load);
load();
