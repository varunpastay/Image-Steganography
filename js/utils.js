// utils.js — shared helpers

const HEADER_SIZE = 128;

/* ── Toast ── */
const Toast = {
  show(msg, type = 'info', duration = 3000) {
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span style="font-size:14px;flex-shrink:0">${icons[type]||'ℹ'}</span>${msg}`;
    c.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'toastOut 0.25s ease forwards';
      setTimeout(() => t.remove(), 250);
    }, duration);
  }
};

/* ── Status pill ── */
const Status = {
  set(text, busy = false) {
    const pill = document.getElementById('statusPill');
    const span = document.getElementById('statusText');
    span.textContent = text;
    pill.className = busy ? 'status-pill busy' : 'status-pill';
  },
  ready() { this.set('Ready'); }
};

/* ── Alert boxes ── */
function showAlert(containerId, type, message) {
  const icons = { error: '✕', success: '✓', info: 'ℹ', warn: '⚠' };
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}"><span>${icons[type]||'ℹ'}</span>${message}</div>`;
}

function clearAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

/* ── Drag & Drop ── */
const dz = {
  over(e, id) {
    e.preventDefault();
    document.getElementById(id)?.classList.add('drag-over');
  },
  leave(id) {
    document.getElementById(id)?.classList.remove('drag-over');
  },
  drop(e, type) {
    e.preventDefault();
    const id = {
      encode: 'enc-drop', decode: 'dec-drop',
      analyze: 'ana-drop', lsb: 'lsb-drop',
      'cmp-orig': 'cmp-orig-drop', 'cmp-stego': 'cmp-stego-drop',
      'st-orig': 'st-orig-drop', 'st-stego': 'st-stego-drop'
    }[type];
    if (id) dz.leave(id);
    const file = e.dataTransfer.files[0];
    if (!file?.type.startsWith('image/')) return;
    App.loadImageFromFile(file, type);
  },
  batchDrop(e) {
    e.preventDefault();
    dz.leave('batch-drop');
    Batch.loadFiles({ files: e.dataTransfer.files });
  },
  dropFile(e) {
    e.preventDefault();
    dz.leave('msg-file-drop');
    App.loadSecretFile({ files: e.dataTransfer.files });
  }
};

/* ── Bit selectors ── */
function initBitSelectors() {
  document.querySelectorAll('.bit-selector').forEach(sel => {
    sel.querySelectorAll('.bit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sel.querySelectorAll('.bit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        App.onBitChange();
      });
    });
  });
}

function getBits(selectorId) {
  const sel = document.getElementById(selectorId);
  if (!sel) return 1;
  const active = sel.querySelector('.bit-btn.active');
  return parseInt(active?.dataset.bits || '1');
}

/* ── String / byte helpers ── */
function textToBits(text) {
  const bytes = new TextEncoder().encode(text);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  return bits;
}

function bitsToText(bits) {
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function bytesToBits(arr) {
  let bits = '';
  for (const b of arr) bits += b.toString(2).padStart(8, '0');
  return bits;
}

function bitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/* ── PSNR / MSE ── */
function computeMetrics(origData, modData) {
  let mse = 0, n = 0;
  for (let i = 0; i < origData.length; i++) {
    if ((i + 1) % 4 === 0) continue;
    const d = origData[i] - modData[i];
    mse += d * d;
    n++;
  }
  mse /= n;
  const psnr = mse === 0 ? 100 : 10 * Math.log10(255 * 255 / mse);
  return { mse: mse.toFixed(4), psnr: psnr.toFixed(2) };
}

/* ── Simple PRNG (seeded) for scatter mode ── */
function seededShuffle(arr, seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ── Password strength ── */
function evalPasswordStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 14) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  const colors = ['', '#ff5f7e', '#ffa040', '#ffc04a', '#2dd98a', '#3ecfcf'];
  return { score, label: labels[score] || '—', color: colors[score] || '#ccc', pct: (score / 5) * 100 };
}

/* ── Image loader ── */
function loadImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getImageData(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { canvas: c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) };
}

/* ── Navigation ── */
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const tab = item.dataset.tab;
      if (!tab) return;
      switchTab(tab);
    });
  });

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed');
  });

  document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('sv-theme', document.body.classList.contains('light') ? 'light' : 'dark');
  });

  // Restore theme
  if (localStorage.getItem('sv-theme') === 'light') document.body.classList.add('light');
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`panel-${tab}`)?.classList.add('active');
  document.getElementById('bcCurrent').textContent =
    tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ');
  clearAlert(`${tab.split('-')[0]}-alert-box`);
}
