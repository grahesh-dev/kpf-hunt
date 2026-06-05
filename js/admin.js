/* ═══════════════════════════════════════════════════════════════
   KPF Hunt — admin.js  v8
   Handles: login, data fetch, stats, check-ins table, leaderboard,
            QR generator, QR mini grid, CSV export, clear data,
            auto-refresh, sidebar nav, filters, sorting
═══════════════════════════════════════════════════════════════ */

const FIREBASE_URL  = 'https://kpfhunt-default-rtdb.firebaseio.com';
const QR_BASE_URL   = 'https://grahesh-dev.github.io/kpf-hunt/scan.html';
const ADMIN_PASS    = 'KPF2026';
const REFRESH_SEC   = 15;

/* ─────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────────*/
let allData       = [];   // raw array of check-in objects
let filteredData  = [];   // after filters applied
let sortCol       = 'timestamp';
let sortDir       = 'desc';
let refreshTimer  = null;
let countdownVal  = REFRESH_SEC;
let countdownTimer = null;

/* ─────────────────────────────────────────────────────────────
   DOM REFS
───────────────────────────────────────────────────────────────*/
const loginOverlay    = document.getElementById('loginOverlay');
const adminWrap       = document.getElementById('adminWrap');
const loginForm       = document.getElementById('loginForm');
const loginPw         = document.getElementById('loginPw');
const loginError      = document.getElementById('loginError');
const logoutBtn       = document.getElementById('logoutBtn');
const sidebarToggle   = document.getElementById('sidebarToggle');
const adminSidebar    = document.getElementById('adminSidebar');
const snavLinks       = document.querySelectorAll('.snav-link');

const statTotal       = document.getElementById('statTotal');
const statPlayers     = document.getElementById('statPlayers');
const statCheckpoints = document.getElementById('statCheckpoints');
const statLast        = document.getElementById('statLast');
const top10List       = document.getElementById('top10List');

const filterName      = document.getElementById('filterName');
const filterOffice    = document.getElementById('filterOffice');
const filterCheckpoint= document.getElementById('filterCheckpoint');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const checkinsBody    = document.getElementById('checkinsBody');
const tableFooter     = document.getElementById('tableFooter');
const exportCsvBtn    = document.getElementById('exportCsvBtn');
const clearDataBtn    = document.getElementById('clearDataBtn');

const lbBody          = document.getElementById('lbBody');
const refreshCountdown= document.getElementById('refreshCountdown');
const refreshBtn      = document.getElementById('refreshBtn');

const qrNumInput      = document.getElementById('qrNumInput');
const genQrBtn        = document.getElementById('genQrBtn');
const qrImg           = document.getElementById('qrImg');
const qrUrlRow        = document.getElementById('qrUrlRow');
const qrUrlText       = document.getElementById('qrUrlText');
const copyUrlBtn      = document.getElementById('copyUrlBtn');
const qrLabel         = document.getElementById('qrLabel');
const qrMiniGrid      = document.getElementById('qrMiniGrid');

/* ─────────────────────────────────────────────────────────────
   LOGIN / SESSION
───────────────────────────────────────────────────────────────*/
function checkSession() {
  return sessionStorage.getItem('kpf_admin') === '1';
}

function showDashboard() {
  loginOverlay.style.display = 'none';
  adminWrap.style.display    = 'flex';
  init();
}

if (checkSession()) {
  showDashboard();
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (loginPw.value === ADMIN_PASS) {
    sessionStorage.setItem('kpf_admin', '1');
    loginError.style.display = 'none';
    showDashboard();
  } else {
    loginError.style.display = '';
    loginPw.value = '';
    loginPw.classList.add('shake');
    loginPw.addEventListener('animationend', () => loginPw.classList.remove('shake'), { once: true });
  }
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('kpf_admin');
  location.reload();
});

/* ─────────────────────────────────────────────────────────────
   SIDEBAR NAV
───────────────────────────────────────────────────────────────*/
snavLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    activateSection(section);
    // close sidebar on mobile
    adminSidebar.classList.remove('open');
  });
});

sidebarToggle.addEventListener('click', () => {
  adminSidebar.classList.toggle('open');
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 900 &&
      !adminSidebar.contains(e.target) &&
      e.target !== sidebarToggle) {
    adminSidebar.classList.remove('open');
  }
});

function activateSection(name) {
  snavLinks.forEach(l => l.classList.toggle('active', l.dataset.section === name));
  document.querySelectorAll('.admin-section').forEach(s => {
    s.classList.toggle('active', s.id === `section-${name}`);
  });
}

/* ─────────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────────────*/
function init() {
  buildCheckpointFilter();
  buildQRMiniGrid();
  fetchData();
  startRefreshCycle();

  refreshBtn.addEventListener('click', () => {
    resetCountdown();
    fetchData();
  });

  // Filters
  filterName.addEventListener('input', applyFilters);
  filterOffice.addEventListener('change', applyFilters);
  filterCheckpoint.addEventListener('change', applyFilters);
  clearFiltersBtn.addEventListener('click', () => {
    filterName.value = '';
    filterOffice.value = '';
    filterCheckpoint.value = '';
    applyFilters();
  });

  // Sortable columns
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = col === 'timestamp' ? 'desc' : 'asc';
      }
      updateSortHeaders();
      renderTable();
    });
  });

  exportCsvBtn.addEventListener('click', exportCSV);
  clearDataBtn.addEventListener('click', clearData);

  // QR generator
  genQrBtn.addEventListener('click', generateQR);
  qrNumInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generateQR(); });
  copyUrlBtn.addEventListener('click', () => {
    const url = qrUrlText.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => flashBtn(copyUrlBtn, 'Copied!'));
    } else {
      fallbackCopy(url);
      flashBtn(copyUrlBtn, 'Copied!');
    }
  });

  // Auto-generate QR 1 on load
  generateQR();
}

/* ─────────────────────────────────────────────────────────────
   DATA FETCH
───────────────────────────────────────────────────────────────*/
async function fetchData() {
  try {
    const res  = await fetch(`${FIREBASE_URL}/checkins.json`);
    const json = await res.json();
    allData = json ? Object.values(json) : [];
    renderAll();
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

function renderAll() {
  renderStats();
  renderTop10();
  applyFilters();
  renderLeaderboard();
}

/* ─────────────────────────────────────────────────────────────
   STATS
───────────────────────────────────────────────────────────────*/
function renderStats() {
  const total       = allData.length;
  const players     = new Set(allData.map(d => d.name?.toLowerCase())).size;
  const checkpoints = new Set(allData.map(d => d.checkpoint)).size;

  statTotal.textContent       = total;
  statPlayers.textContent     = players;
  statCheckpoints.textContent = `${checkpoints}/100`;

  if (total > 0) {
    const sorted = [...allData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    statLast.textContent = formatTime(sorted[0].timestamp);
  } else {
    statLast.textContent = '—';
  }
}

/* ─────────────────────────────────────────────────────────────
   TOP 10
───────────────────────────────────────────────────────────────*/
function renderTop10() {
  const lb = buildLeaderboard(allData).slice(0, 10);

  if (lb.length === 0) {
    top10List.innerHTML = '<div class="empty-state">No data yet.</div>';
    return;
  }

  top10List.innerHTML = lb.map((p, i) => {
    const rank  = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const badge = officeBadge(p.office);
    return `
      <div class="top10-row">
        <span class="top10-rank ${rankClass}">${medal}</span>
        <span class="top10-name">${esc(p.name)}</span>
        ${badge}
        <span class="top10-count">${p.count}/100</span>
      </div>
    `;
  }).join('');
}

/* ─────────────────────────────────────────────────────────────
   FILTERS & TABLE
───────────────────────────────────────────────────────────────*/
function applyFilters() {
  const name = filterName.value.toLowerCase().trim();
  const office = filterOffice.value;
  const cp = filterCheckpoint.value;

  filteredData = allData.filter(d => {
    if (name   && !d.name?.toLowerCase().includes(name)) return false;
    if (office && d.office !== office)                    return false;
    if (cp     && d.checkpoint !== cp)                    return false;
    return true;
  });

  renderTable();
}

function renderTable() {
  const sorted = sortData([...filteredData]);

  if (sorted.length === 0) {
    checkinsBody.innerHTML = '<tr><td colspan="5" class="empty-state">No matching entries.</td></tr>';
    tableFooter.textContent = 'Showing 0 entries';
    return;
  }

  checkinsBody.innerHTML = sorted.map((d, i) => {
    const rowClass = d.office === 'London' ? 'row-london' : d.office === 'New York' ? 'row-ny' : '';
    return `
      <tr class="${rowClass}">
        <td>${i + 1}</td>
        <td>${formatDateTime(d.timestamp)}</td>
        <td>${esc(d.name || '—')}</td>
        <td>${officeBadge(d.office)}</td>
        <td>${esc(d.checkpoint || '—')}</td>
      </tr>
    `;
  }).join('');

  tableFooter.textContent = `Showing ${sorted.length} of ${allData.length} entries`;
}

function sortData(arr) {
  return arr.sort((a, b) => {
    let va = a[sortCol] ?? '';
    let vb = b[sortCol] ?? '';

    if (sortCol === 'timestamp') {
      va = new Date(va).getTime() || 0;
      vb = new Date(vb).getTime() || 0;
    } else if (sortCol === 'idx') {
      // already in order
      return 0;
    } else {
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
    }

    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === sortCol) {
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   LEADERBOARD
───────────────────────────────────────────────────────────────*/
function renderLeaderboard() {
  const lb = buildLeaderboard(allData);

  if (lb.length === 0) {
    lbBody.innerHTML = '<tr><td colspan="6" class="empty-state">No data yet.</td></tr>';
    return;
  }

  lbBody.innerHTML = lb.map((p, i) => {
    const rank  = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const pct   = (p.count / 100) * 100;
    return `
      <tr>
        <td>${medal}</td>
        <td>${esc(p.name)}</td>
        <td>${officeBadge(p.office)}</td>
        <td>${p.count}/100</td>
        <td>
          <div class="lb-progress-bar">
            <div class="lb-progress-fill" style="width:${pct}%"></div>
          </div>
        </td>
        <td>${formatDateTime(p.lastTime)}</td>
      </tr>
    `;
  }).join('');
}

/* ─────────────────────────────────────────────────────────────
   LEADERBOARD BUILDER (shared logic)
───────────────────────────────────────────────────────────────*/
function buildLeaderboard(data) {
  const map = {};

  data.forEach(d => {
    if (!d.name) return;
    const key = d.name.toLowerCase();
    if (!map[key]) {
      map[key] = { name: d.name, office: d.office, checkpoints: new Set(), lastTime: d.timestamp };
    }
    if (d.checkpoint) map[key].checkpoints.add(d.checkpoint);
    // track latest timestamp
    if (d.timestamp && d.timestamp > map[key].lastTime) map[key].lastTime = d.timestamp;
  });

  return Object.values(map)
    .map(p => ({ ...p, count: p.checkpoints.size }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      // tie-break: earliest last check-in wins (they finished first)
      return new Date(a.lastTime) - new Date(b.lastTime);
    });
}

/* ─────────────────────────────────────────────────────────────
   QR CODES
───────────────────────────────────────────────────────────────*/
function generateQR() {
  const num = parseInt(qrNumInput.value, 10);
  if (isNaN(num) || num < 1 || num > 100) {
    qrNumInput.classList.add('error');
    qrNumInput.addEventListener('input', () => qrNumInput.classList.remove('error'), { once: true });
    return;
  }

  const url     = `${QR_BASE_URL}?qr=${num}`;
  const encoded = encodeURIComponent(url);
  const qrSrc   = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&margin=8`;

  qrImg.src = qrSrc;
  qrImg.style.display = '';
  qrUrlText.textContent = url;
  qrUrlRow.style.display = '';
  qrLabel.textContent = `Checkpoint ${num}`;
}

function buildQRMiniGrid() {
  qrMiniGrid.innerHTML = '';
  for (let i = 1; i <= 100; i++) {
    const url     = `${QR_BASE_URL}?qr=${i}`;
    const encoded = encodeURIComponent(url);
    const src     = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encoded}&margin=4`;

    const cell = document.createElement('div');
    cell.className = 'qr-mini-cell';
    cell.title = `Checkpoint ${i} — click to preview`;
    cell.innerHTML = `
      <img src="${src}" alt="CP ${i}" loading="lazy" />
      <span>CP ${i}</span>
    `;
    cell.addEventListener('click', () => {
      qrNumInput.value = i;
      generateQR();
      activateSection('qrcodes');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    qrMiniGrid.appendChild(cell);
  }
}

/* ─────────────────────────────────────────────────────────────
   CHECKPOINT FILTER DROPDOWN
───────────────────────────────────────────────────────────────*/
function buildCheckpointFilter() {
  for (let i = 1; i <= 100; i++) {
    const opt = document.createElement('option');
    opt.value = `Checkpoint ${i}`;
    opt.textContent = `Checkpoint ${i}`;
    filterCheckpoint.appendChild(opt);
  }
}

/* ─────────────────────────────────────────────────────────────
   AUTO-REFRESH
───────────────────────────────────────────────────────────────*/
function startRefreshCycle() {
  resetCountdown();
}

function resetCountdown() {
  clearInterval(refreshTimer);
  clearInterval(countdownTimer);
  countdownVal = REFRESH_SEC;
  updateCountdownUI();

  countdownTimer = setInterval(() => {
    countdownVal--;
    updateCountdownUI();
    if (countdownVal <= 0) {
      fetchData();
      countdownVal = REFRESH_SEC;
    }
  }, 1000);
}

function updateCountdownUI() {
  refreshCountdown.textContent = `Refreshing in ${countdownVal}s`;
}

/* ─────────────────────────────────────────────────────────────
   CSV EXPORT
───────────────────────────────────────────────────────────────*/
function exportCSV() {
  if (allData.length === 0) { alert('No data to export.'); return; }

  const headers = ['Timestamp', 'Name', 'Office', 'Checkpoint'];
  const rows = allData
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map(d => [
      d.timestamp || '',
      d.name       || '',
      d.office     || '',
      d.checkpoint || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `kpf-hunt-checkins-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────────
   CLEAR DATA
───────────────────────────────────────────────────────────────*/
async function clearData() {
  if (!confirm('⚠️ Delete ALL check-in data?\nThis cannot be undone.')) return;
  if (!confirm('Are you absolutely sure? All data will be permanently deleted.')) return;

  try {
    await fetch(`${FIREBASE_URL}/checkins.json`, { method: 'DELETE' });
    allData = [];
    renderAll();
  } catch (err) {
    alert('Failed to clear data. Check console.');
    console.error(err);
  }
}

/* ─────────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────────────*/
function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return '—'; }
}

function officeBadge(office) {
  if (office === 'London')   return `<span class="badge-london">London</span>`;
  if (office === 'New York') return `<span class="badge-ny">New York</span>`;
  return `<span>${esc(office || '—')}</span>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function flashBtn(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
}
