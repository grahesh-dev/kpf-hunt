/* ═══════════════════════════════════════════════════════════════════
   KPF HUNT — scan.js  (v7 · GitHub Pages rebuild)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─── CONFIG ─────────────────────────────────────────────────────── */
const FIREBASE_URL = 'https://kpfhunt-default-rtdb.firebaseio.com';

const TEAM_PASSWORDS = {
  'Team Alpha': 'HUNT01',
  'Team Beta':  'HUNT02',
  'Team Gamma': 'HUNT03',
  'Team Delta': 'HUNT04',
  'Team Sigma': 'HUNT05',
};

/* ─── DOM REFS ───────────────────────────────────────────────────── */
const invalidState    = document.getElementById('invalid-state');
const formState       = document.getElementById('form-state');
const successState    = document.getElementById('success-state');
const checkpointBadge = document.getElementById('checkpoint-badge');
const scanForm        = document.getElementById('scan-form');
const teamSelect      = document.getElementById('team-select');
const passwordInput   = document.getElementById('password-input');
const answerInput     = document.getElementById('answer-input');
const pwError         = document.getElementById('pw-error');
const answerError     = document.getElementById('answer-error');
const formError       = document.getElementById('form-error');
const submitBtn       = document.getElementById('submit-btn');
const successMsg      = document.getElementById('success-msg');
const pwToggle        = document.getElementById('pw-toggle');
const eyeIcon         = document.getElementById('eye-icon');

/* ─── READ QR PARAM ──────────────────────────────────────────────── */
const params          = new URLSearchParams(window.location.search);
const qrParam         = params.get('qr');
const qrNum           = parseInt(qrParam, 10);
const validQR         = !isNaN(qrNum) && qrNum >= 1 && qrNum <= 5;
const checkpointLabel = validQR ? `Checkpoint ${qrNum}` : null;

/* ─── INIT ───────────────────────────────────────────────────────── */
if (!validQR) {
  invalidState.style.display = 'flex';
} else {
  checkpointBadge.textContent = `📍 ${checkpointLabel}`;
  document.title = `KPF Hunt — ${checkpointLabel}`;
  formState.style.display = 'flex';
}

/* ─── PASSWORD VISIBILITY TOGGLE ────────────────────────────────── */
const EYE_OPEN = `
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>`;

const EYE_CLOSED = `
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
           a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8
           a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>`;

pwToggle.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  eyeIcon.innerHTML  = isPassword ? EYE_CLOSED : EYE_OPEN;
  pwToggle.setAttribute('aria-label',
    isPassword ? 'Hide password' : 'Show password');
});

/* ─── HELPERS ────────────────────────────────────────────────────── */
function clearErrors() {
  pwError.textContent     = '';
  answerError.textContent = '';
  formError.textContent   = '';
  formError.classList.remove('visible');
  passwordInput.classList.remove('error');
  answerInput.classList.remove('error');
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.classList.add('visible');
}

function setLoading(on) {
  submitBtn.classList.toggle('loading', on);
  submitBtn.disabled = on;
}

/* ─── FIREBASE SUBMIT ────────────────────────────────────────────── */
/*
 * CRITICAL: No Content-Type header.
 * Omitting Content-Type keeps this a CORS "simple request" — the browser
 * sends it directly with no OPTIONS preflight. Firebase REST accepts the
 * JSON body correctly regardless of whether the header is present.
 */
async function submitToFirebase(team, checkpoint, answer) {
  const payload = {
    team:       team,
    checkpoint: checkpoint,
    answer:     answer,
    timestamp:  new Date().toISOString(),
  };

  console.log('[scan] Submitting to Firebase:', payload);

  const response = await fetch(FIREBASE_URL + '/submissions.json', {
    method: 'POST',
    body:   JSON.stringify(payload),
    // ← NO headers object — avoids CORS preflight
  });

  console.log('[scan] Firebase response status:', response.status);

  if (!response.ok) {
    throw new Error('Firebase returned HTTP ' + response.status);
  }

  const result = await response.json();
  console.log('[scan] Firebase result:', result);
  return result;
}

/* ─── FORM SUBMIT ────────────────────────────────────────────────── */
scanForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const team     = teamSelect.value;
  const password = passwordInput.value.trim();
  const answer   = answerInput.value.trim();

  /* Validate */
  let hasError = false;

  if (!team) {
    showFormError('Please select your team.');
    return;
  }

  if (!password) {
    pwError.textContent = 'Password is required.';
    passwordInput.classList.add('error');
    hasError = true;
  } else if (password.toUpperCase() !== TEAM_PASSWORDS[team]) {
    pwError.textContent = 'Incorrect password for this team.';
    passwordInput.classList.add('error');
    /* Shake the password field wrapper */
    const wrap = passwordInput.closest('.pw-wrap');
    wrap.classList.add('shake');
    wrap.addEventListener('animationend', () => wrap.classList.remove('shake'), { once: true });
    hasError = true;
  }

  if (!answer) {
    answerError.textContent = 'Please enter your answer.';
    answerInput.classList.add('error');
    hasError = true;
  }

  if (hasError) return;

  /* Submit */
  setLoading(true);

  try {
    await submitToFirebase(team, checkpointLabel, answer);

    /* Success — swap states */
    formState.style.display    = 'none';
    successMsg.textContent     = `Good luck, ${team}! 🎉`;
    successState.style.display = 'flex';

  } catch (err) {
    console.error('[scan] Submission error:', err);
    showFormError('Submission failed. Please check your connection and try again.');
    setLoading(false);
  }
});

/* ─── CLEAR ERRORS ON INPUT ──────────────────────────────────────── */
teamSelect.addEventListener('change', clearErrors);

passwordInput.addEventListener('input', () => {
  pwError.textContent = '';
  passwordInput.classList.remove('error');
  formError.classList.remove('visible');
});

answerInput.addEventListener('input', () => {
  answerError.textContent = '';
  answerInput.classList.remove('error');
});
