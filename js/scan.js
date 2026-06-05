/* ═══════════════════════════════════════════════════════════════
   KPF Hunt — scan.js  v8
   Handles: QR param parsing, form validation, duplicate check,
            Firebase POST (no Content-Type header), success/error UI
═══════════════════════════════════════════════════════════════ */

const FIREBASE_URL = 'https://kpfhunt-default-rtdb.firebaseio.com';

/* ── DOM refs ── */
const invalidCard  = document.getElementById('invalidCard');
const formCard     = document.getElementById('formCard');
const successCard  = document.getElementById('successCard');
const cpLabel      = document.getElementById('cpLabel');
const checkinForm  = document.getElementById('checkinForm');
const nameInput    = document.getElementById('nameInput');
const officeSelect = document.getElementById('officeSelect');
const submitBtn    = document.getElementById('submitBtn');
const btnText      = submitBtn.querySelector('.btn-text');
const btnSpinner   = submitBtn.querySelector('.btn-spinner');
const dupWarning   = document.getElementById('dupWarning');
const errorMsg     = document.getElementById('errorMsg');
const successTitle = document.getElementById('successTitle');
const successMsgEl = document.getElementById('successMsg');

/* ── Read ?qr= param ── */
const params = new URLSearchParams(window.location.search);
const qrRaw  = params.get('qr');
const qrNum  = parseInt(qrRaw, 10);
const validQR = !isNaN(qrNum) && qrNum >= 1 && qrNum <= 100;

if (!validQR) {
  invalidCard.style.display = '';
} else {
  cpLabel.textContent = `Checkpoint ${qrNum}`;
  formCard.style.display = '';
}

/* ── Form submit ── */
checkinForm && checkinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlerts();

  const name   = nameInput.value.trim();
  const office = officeSelect.value;

  /* Basic validation */
  if (!name) {
    nameInput.classList.add('error');
    nameInput.focus();
    nameInput.addEventListener('input', () => nameInput.classList.remove('error'), { once: true });
    return;
  }
  if (!office) {
    officeSelect.classList.add('error');
    officeSelect.focus();
    officeSelect.addEventListener('change', () => officeSelect.classList.remove('error'), { once: true });
    return;
  }

  setLoading(true);

  /* ── Duplicate check ── */
  try {
    const dupFound = await checkDuplicate(name, qrNum);
    if (dupFound) {
      dupWarning.style.display = '';
      dupWarning.classList.remove('shake');
      void dupWarning.offsetWidth; // reflow
      dupWarning.classList.add('shake');
      dupWarning.addEventListener('animationend', () => dupWarning.classList.remove('shake'), { once: true });
      setLoading(false);
      return;
    }
  } catch (err) {
    /* If the duplicate check itself fails, still allow submission */
    console.warn('Duplicate check failed, proceeding:', err);
  }

  /* ── Submit to Firebase ── */
  const payload = {
    name:       name,
    office:     office,
    checkpoint: `Checkpoint ${qrNum}`,
    timestamp:  new Date().toISOString()
  };

  try {
    const res = await fetch(`${FIREBASE_URL}/checkins.json`, {
      method: 'POST',
      body: JSON.stringify(payload)
      /* NO headers — avoids CORS preflight on Firebase REST API */
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    /* ── Success ── */
    formCard.style.display = 'none';
    successTitle.textContent = `Checked in at Checkpoint ${qrNum}!`;
    successMsgEl.textContent = `Good luck, ${name}! 🎉`;
    successCard.style.display = '';

  } catch (err) {
    console.error('Firebase POST failed:', err);
    errorMsg.style.display = '';
    setLoading(false);
  }
});

/* ── Helpers ── */

async function checkDuplicate(name, cpNum) {
  const res  = await fetch(`${FIREBASE_URL}/checkins.json`);
  const data = await res.json();
  if (!data) return false;

  const entries   = Object.values(data);
  const cpStr     = `Checkpoint ${cpNum}`;
  const nameLower = name.toLowerCase();

  return entries.some(entry =>
    entry.name &&
    entry.name.toLowerCase() === nameLower &&
    entry.checkpoint === cpStr
  );
}

function setLoading(on) {
  submitBtn.disabled = on;
  btnText.style.display    = on ? 'none' : '';
  btnSpinner.style.display = on ? '' : 'none';
}

function hideAlerts() {
  dupWarning.style.display = 'none';
  errorMsg.style.display   = 'none';
}
