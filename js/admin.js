/* ═══════════════════════════════════════════════════════════════════
   KPF HUNT — admin.js  (v7 · GitHub Pages rebuild)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─── CONFIG ─────────────────────────────────────────────────────── */
const FIREBASE_URL = 'https://kpfhunt-default-rtdb.firebaseio.com';
const PASSWORD     = 'KPF2026';
const REFRESH_SEC  = 15;

/* QR codes use the hardcoded GitHub Pages base URL */
const QR_BASE_URL  = 'https://grahesh-dev.github.io/kpf-hunt/scan.html';

const TEAMS = [
  'Team Alpha',
  'Team Beta',
  'Team Gamma',
  'Team Delta',
  'Team Sigma',
];

const CHECKPOINTS = [
  'Checkpoint 1',
  'Checkpoint 2',
  'Checkpoint 3',
  'Checkpoint 4',
  'Checkpoint 5',
];

/* Maps team name → CSS class for table row tint and dot colour */
const TEAM_ROW_CLASS = {
  'Team Alpha': 'row-alpha',
  'Team Beta':  'row-beta',
  'Team Gamma': 'row-gamma',
  'Team Delta': 'row-delta',
  'Team Sigma': 'row-sigma',
};
const TEAM_DOT_CLASS = {
  'Team Alpha': 'dot-alpha',
  'Team Beta':  'dot-beta',
  'Team Gamma': 'dot-gamma',
  'Team Delta': 'dot-delta',
  'Team Sigma': 'dot-sigma',
};

/* ─── STATE ──────────────────────────────────────────────────────── */
let allSubmissions = [];   // full array, newest-first after fetch
let filteredData   = [];   // subset after search filter
let sortCol        = 'timestamp';
let sortDir        = 'desc';
let countdownTimer = null;
let countdownSecs  = REFRESH_SEC;

/* ─── DOM REFS ───────────────────────────────────────────────────── */
const loginOverlay    = document.getElementById('login-overlay');
const dashboard       = document.getElementById('dashboard');
const loginForm       = document.getElementById('login-form');
const loginError      = document.getElementById('login-error');
const adminPwInput    = document.getElementById('admin-pw');

const statusDot       = document.getElementById('status-dot');
const statusText      = document.getElementById('status-text');
const countdownNum    = document.getElementById('countdown-num');

const statTotal       = document.getElementById('stat-total');
const statTeams       = document.getElementById('stat-teams');
const statCheckpoints = document.getElementById('stat-checkpoints');
const statLast        = document.getElementById('stat-last');

const progressBody    = document.getElementById('progress-body');
const submissionsBody = document.getElementById('submissions-body');
const submissionsTable= document.getElementById('submissions-table');
const tableEmpty      = document.getElementById('table-empty');
const tableSearch     = document.getElementById('table-search');
const qrGrid          = document.getElementById('qr-grid');

const refreshBtn      = document.getElementById('refresh-btn');
const exportBtn       = document.getElementById('export-btn');
const clearBtn        = document.getElementById('clear-btn');
const logoutBtn       = document.getElementById('logout-btn');


/* ═══════════════════════════════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════════════════════════════ */
function isLoggedIn() {
  return sessionStorage.getItem('kpf_admin') === 'true';
}

function showDashboard() {
  loginOverlay.style.display = 'none';
  dashboard.style.display    = 'block';
  buildQRCodes();
  startAutoRefresh();
  fetchData();
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = adminPwInput.value.trim();
  if (pw === PASSWORD) {
    sessionStorage.setItem('kpf_admin', 'true');
    loginError.textContent = '';
    showDashboard();
  } else {
    loginError.textContent = 'Incorrect password.';
    loginForm.classList.add('shake');
    loginForm.addEventListener('animationend',
      () => loginForm.classList.remove('shake'), { once: true });
    adminPwInput.value = '';
    adminPwInput.focus();
  }
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('kpf_admin');
  stopAutoRefresh();
  dashboard.style.display    = 'none';
  loginOverlay.style.display = 'flex';
  adminPwInput.value = '';
});

/* Auto-login if session still valid */
if (isLoggedIn()) showDashboard();


/* ═══════════════════════════════════════════════════════════════════
   DATA FETCHING
   ═══════════════════════════════════════════════════════════════════ */
function setStatus(state, msg) {
  statusDot.className    = 'status-dot status-dot--' + state;
  statusText.textContent = msg;
}

/**
 * Fetch all submissions from Firebase.
 * Firebase returns null when the DB is empty — we normalise that to [].
 * Firebase returns an object keyed by push-IDs — we use Object.values().
 */
async function fetchSubmissions() {
  console.log('[admin] Fetching from Firebase…');
  const res = await fetch(FIREBASE_URL + '/submissions.json');

  if (!res.ok) throw new Error('HTTP ' + res.status);

  const data = await res.json();
  console.log('[admin] Raw Firebase response:', data);

  if (!data) {
    console.log('[admin] Firebase returned null (empty DB) — treating as []');
    return [];
  }

  const submissions = Object.values(data);
  console.log('[admin] Parsed submissions:', submissions);
  return submissions;
}

async function fetchData() {
  setStatus('loading', 'Fetching data…');
  try {
    const submissions = await fetchSubmissions();

    /* Sort newest first */
    allSubmissions = submissions.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    const now = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const count = allSubmissions.length;
    setStatus('ok',
      count === 0
        ? `Last updated at ${now} · No submissions yet`
        : `Last updated at ${now} · ${count} submission${count !== 1 ? 's' : ''}`
    );

    applySearchFilter();
    renderStats();
    renderProgressGrid();

  } catch (err) {
    console.error('[admin] fetchData error:', err);
    setStatus('error', 'Error fetching data: ' + err.message);
  }
}


/* ═══════════════════════════════════════════════════════════════════
   AUTO-REFRESH
   ═══════════════════════════════════════════════════════════════════ */
function startAutoRefresh() {
  stopAutoRefresh();
  countdownSecs = REFRESH_SEC;
  countdownNum.textContent = countdownSecs;

  countdownTimer = setInterval(() => {
    countdownSecs--;
    countdownNum.textContent = countdownSecs;
    if (countdownSecs <= 0) {
      countdownSecs = REFRESH_SEC;
      fetchData();
    }
  }, 1000);
}

function stopAutoRefresh() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function resetCountdown() {
  countdownSecs = REFRESH_SEC;
  countdownNum.textContent = countdownSecs;
}

refreshBtn.addEventListener('click', () => {
  resetCountdown();
  fetchData();
});


/* ═══════════════════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════════════════ */
function renderStats() {
  const total = allSubmissions.length;
  const teams = new Set(allSubmissions.map(s => s.team)).size;
  const cps   = new Set(allSubmissions.map(s => s.checkpoint)).size;

  statTotal.textContent       = total;
  statTeams.textContent       = teams;
  statCheckpoints.textContent = cps;
  statLast.textContent        = total === 0 ? '—' : formatTimeFull(allSubmissions[0].timestamp);
}


/* ═══════════════════════════════════════════════════════════════════
   PROGRESS GRID
   ═══════════════════════════════════════════════════════════════════ */
function renderProgressGrid() {
  /* Build lookup: "Team||Checkpoint" → earliest timestamp */
  const lookup = {};
  /* Sort oldest→newest so first write wins */
  const byAge = [...allSubmissions].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  byAge.forEach(s => {
    const key = s.team + '||' + s.checkpoint;
    if (!lookup[key]) lookup[key] = s.timestamp;
  });

  progressBody.innerHTML = '';

  TEAMS.forEach(team => {
    const tr = document.createElement('tr');

    /* Team name cell */
    const tdTeam = document.createElement('td');
    tdTeam.className = 'pg-team-col';
    const dot = document.createElement('span');
    dot.className = 'team-dot ' + (TEAM_DOT_CLASS[team] || '');
    tdTeam.appendChild(dot);
    tdTeam.appendChild(document.createTextNode(team));
    tr.appendChild(tdTeam);

    /* Checkpoint cells */
    CHECKPOINTS.forEach(cp => {
      const key = team + '||' + cp;
      const ts  = lookup[key];
      const td  = document.createElement('td');
      const cell = document.createElement('div');
      cell.className = 'pg-cell';

      const check = document.createElement('div');
      if (ts) {
        check.className  = 'pg-check pg-check--done';
        check.textContent = '✓';
        const timeEl = document.createElement('div');
        timeEl.className  = 'pg-time';
        timeEl.textContent = formatTimeShort(ts);
        cell.appendChild(check);
        cell.appendChild(timeEl);
      } else {
        check.className  = 'pg-check pg-check--empty';
        check.textContent = '—';
        cell.appendChild(check);
      }

      td.appendChild(cell);
      tr.appendChild(td);
    });

    progressBody.appendChild(tr);
  });
}


/* ═══════════════════════════════════════════════════════════════════
   SUBMISSIONS TABLE
   ═══════════════════════════════════════════════════════════════════ */
function applySearchFilter() {
  const q = (tableSearch.value || '').toLowerCase().trim();
  filteredData = q
    ? allSubmissions.filter(s =>
        (s.team       || '').toLowerCase().includes(q) ||
        (s.checkpoint || '').toLowerCase().includes(q) ||
        (s.answer     || '').toLowerCase().includes(q)
      )
    : [...allSubmissions];

  applySortAndRender();
}

function applySortAndRender() {
  const sorted = [...filteredData].sort((a, b) => {
    let va, vb;

    if (sortCol === 'timestamp') {
      va = new Date(a.timestamp).getTime();
      vb = new Date(b.timestamp).getTime();
    } else if (sortCol === 'index') {
      /* "index" means original position in allSubmissions (newest-first) */
      va = allSubmissions.indexOf(a);
      vb = allSubmissions.indexOf(b);
    } else {
      va = String(a[sortCol] ?? '').toLowerCase();
      vb = String(b[sortCol] ?? '').toLowerCase();
    }

    if (va < vb) return sortDir === 'asc' ? -1 :  1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  renderTable(sorted);
}

function renderTable(rows) {
  submissionsBody.innerHTML = '';

  if (rows.length === 0) {
    tableEmpty.style.display    = 'block';
    submissionsTable.style.display = 'none';
    return;
  }

  tableEmpty.style.display    = 'none';
  submissionsTable.style.display = '';

  rows.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (TEAM_ROW_CLASS[s.team]) tr.className = TEAM_ROW_CLASS[s.team];

    tr.innerHTML = `
      <td class="col-num">${i + 1}</td>
      <td class="col-time">${formatTimeFull(s.timestamp)}</td>
      <td class="col-team">
        <span class="team-dot ${TEAM_DOT_CLASS[s.team] || ''}"></span>${escHtml(s.team || '—')}
      </td>
      <td class="col-cp">${escHtml(s.checkpoint || '—')}</td>
      <td class="col-ans">${escHtml(s.answer || '—')}</td>
    `;
    submissionsBody.appendChild(tr);
  });
}

/* Search */
tableSearch.addEventListener('input', applySearchFilter);

/* Sortable column headers */
document.querySelectorAll('.submissions-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = col === 'timestamp' ? 'desc' : 'asc';
    }
    /* Update header indicator classes */
    document.querySelectorAll('.submissions-table th.sortable').forEach(h => {
      h.classList.remove('sort-asc', 'sort-desc');
    });
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    applySortAndRender();
  });
});


/* ═══════════════════════════════════════════════════════════════════
   QR CODES
   ═══════════════════════════════════════════════════════════════════ */
function buildQRCodes() {
  qrGrid.innerHTML = '';

  for (let n = 1; n <= 5; n++) {
    const scanUrl  = `${QR_BASE_URL}?qr=${n}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(scanUrl)}`;

    const card = document.createElement('div');
    card.className = 'qr-card';
    card.innerHTML = `
      <img class="qr-img" src="${qrApiUrl}" alt="QR code for Checkpoint ${n}" loading="lazy" />
      <div class="qr-label">Checkpoint ${n}</div>
      <div class="qr-url">${escHtml(scanUrl)}</div>
      <button class="btn btn-outline btn-sm copy-btn" data-url="${escHtml(scanUrl)}">Copy URL</button>
    `;
    qrGrid.appendChild(card);
  }

  /* Copy-URL buttons */
  qrGrid.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;

      const doSuccess = () => {
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy URL';
          btn.classList.remove('copied');
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(doSuccess).catch(() => fallbackCopy(url, doSuccess));
      } else {
        fallbackCopy(url, doSuccess);
      }
    });
  });
}

function fallbackCopy(text, callback) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); callback(); } catch (_) { /* silent */ }
  document.body.removeChild(ta);
}


/* ═══════════════════════════════════════════════════════════════════
   EXPORT CSV
   ═══════════════════════════════════════════════════════════════════ */
exportBtn.addEventListener('click', () => {
  if (allSubmissions.length === 0) {
    alert('No data to export.');
    return;
  }

  const headers = ['Timestamp', 'Team', 'Checkpoint', 'Answer'];
  const rows = allSubmissions.map(s => [
    csvCell(s.timestamp),
    csvCell(s.team),
    csvCell(s.checkpoint),
    csvCell(s.answer),
  ]);

  const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `kpf-hunt-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

function csvCell(val) {
  return '"' + String(val ?? '').replace(/"/g, '""') + '"';
}


/* ═══════════════════════════════════════════════════════════════════
   CLEAR ALL DATA
   ═══════════════════════════════════════════════════════════════════ */
clearBtn.addEventListener('click', async () => {
  const first = window.confirm(
    '⚠️ Delete ALL submissions from Firebase?\n\nThis cannot be undone.'
  );
  if (!first) return;

  const second = window.confirm('Double-confirm: permanently delete all data?');
  if (!second) return;

  clearBtn.disabled    = true;
  clearBtn.textContent = 'Clearing…';

  try {
    const res = await fetch(FIREBASE_URL + '/submissions.json', { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    allSubmissions = [];
    filteredData   = [];
    applySearchFilter();
    renderStats();
    renderProgressGrid();
    setStatus('ok', 'All data cleared successfully.');

  } catch (err) {
    alert('Failed to clear data: ' + err.message);
  } finally {
    clearBtn.disabled    = false;
    clearBtn.textContent = '🗑 Clear';
  }
});


/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function formatTimeFull(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day:    '2-digit',
      month:  'short',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch (_) { return iso; }
}

function formatTimeShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour:   '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch (_) { return ''; }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
