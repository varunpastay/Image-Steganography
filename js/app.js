// app.js — Main application controller

const App = {
  images: {},        // keyed by type: 'encode','decode','analyze','lsb','cmp-orig','cmp-stego','st-orig','st-stego'
  secretFile: null,  // { bytes, name, type }
  encLSB: 1,
  decLSB: 1,

  init() {
    initNav();
    initBitSelectors();
    this._initPassStrength();
    this._restoreSettings();
  },

  /* ── Image loading ── */
  loadImage(input, type) {
    const file = input.files[0];
    if (!file) return;
    this.loadImageFromFile(file, type);
  },

  loadImageFromFile(file, type) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        this.images[type] = img;
        this._showPreview(type, e.target.result);
        this._updateMeta(type, img, file);
        if (type === 'encode') this._updateCapacity();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  _showPreview(type, src) {
    const map = {
      'encode': ['enc-dz-content','enc-dz-preview','enc-preview-img'],
      'decode': ['dec-dz-content','dec-dz-preview','dec-preview-img'],
      'analyze': ['ana-dz-content','ana-dz-preview','ana-preview-img'],
      'lsb': ['lsb-dz-content','lsb-dz-preview','lsb-preview-img'],
      'cmp-orig': ['cmp-orig-dz-content','cmp-orig-dz-preview','cmp-orig-img'],
      'cmp-stego': ['cmp-stego-dz-content','cmp-stego-dz-preview','cmp-stego-img'],
      'st-orig': ['st-orig-dz-content','st-orig-dz-preview','st-orig-img'],
      'st-stego': ['st-stego-dz-content','st-stego-dz-preview','st-stego-img'],
    };
    const ids = map[type];
    if (!ids) return;
    const [contentId, previewId, imgId] = ids;
    document.getElementById(contentId).style.display = 'none';
    document.getElementById(previewId).style.display = 'block';
    document.getElementById(imgId).src = src;
  },

  _updateMeta(type, img, file) {
    if (type === 'encode') {
      document.getElementById('enc-image-meta').style.display = 'block';
      document.getElementById('enc-dims').textContent = `${img.width} × ${img.height}`;
      document.getElementById('enc-fsize').textContent = formatBytes(file.size);
      document.getElementById('enc-cap1').textContent = formatBytes(Stego.capacity(img, 1));
      document.getElementById('enc-cap4').textContent = formatBytes(Stego.capacity(img, 4));
    } else if (type === 'decode') {
      document.getElementById('dec-image-meta').style.display = 'block';
      document.getElementById('dec-dims').textContent = `${img.width} × ${img.height}`;
      document.getElementById('dec-fsize').textContent = formatBytes(file.size);
    }
  },

  /* ── Toggles ── */
  toggleAES(prefix) {
    const tog = document.getElementById(`${prefix}-aes-toggle`);
    tog.classList.toggle('on');
    const block = document.getElementById(`${prefix}-pass-block`);
    block.style.display = tog.classList.contains('on') ? 'block' : 'none';
  },

  toggleScatter(prefix) {
    const tog = document.getElementById(`${prefix}-scatter-toggle`);
    if (!tog) return;
    tog.classList.toggle('on');
    const block = document.getElementById(`${prefix}-seed-block`);
    if (block) block.style.display = tog.classList.contains('on') ? 'block' : 'none';
  },

  toggleFileMode() {
    const tog = document.getElementById('enc-file-toggle');
    tog.classList.toggle('on');
    const isFile = tog.classList.contains('on');
    this.switchMsgTab(isFile ? 'file' : 'text',
      document.querySelector('.tab-mini-btn' + (isFile ? ':last-child' : ':first-child')));
  },

  switchMsgTab(tab, btn) {
    document.querySelectorAll('.tab-mini-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('msg-text-area').style.display = tab === 'text' ? 'block' : 'none';
    document.getElementById('msg-file-area').style.display = tab === 'file' ? 'block' : 'none';
  },

  /* ── Message input ── */
  onMsgInput() {
    const msg = document.getElementById('enc-message').value;
    const bytes = new TextEncoder().encode(msg).length;
    document.getElementById('char-count').textContent = `${msg.length} chars · ${formatBytes(bytes)}`;
    this._updateCapacity();
  },

  onBitChange() {
    this._updateCapacity();
  },

  _updateCapacity() {
    const img = this.images['encode'];
    if (!img) return;
    const lsb = getBits('bit-selector');
    const cap = Stego.capacity(img, lsb);
    const msg = document.getElementById('enc-message').value;
    const isFileMode = document.getElementById('enc-file-toggle').classList.contains('on');
    let used = isFileMode
      ? (this.secretFile?.bytes.length || 0)
      : new TextEncoder().encode(msg).length;
    const pct = Math.min(100, (used / cap) * 100);
    const fill = document.getElementById('cap-fill');
    fill.style.width = pct + '%';
    fill.className = 'cap-fill' + (pct > 90 ? ' danger' : pct > 70 ? ' warn' : '');
    document.getElementById('cap-pct').textContent = pct.toFixed(1) + '%';
  },

  /* ── File embed ── */
  loadSecretFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const arr = new Uint8Array(e.target.result);
      this.secretFile = { bytes: arr, name: file.name, type: file.type };
      document.getElementById('file-selected-name').textContent =
        `${file.name} (${formatBytes(arr.length)})`;
      this._updateCapacity();
    };
    reader.readAsArrayBuffer(file);
  },

  /* ── Encode ── */
  async encode() {
    clearAlert('enc-alert-box');
    const img = this.images['encode'];
    if (!img) { showAlert('enc-alert-box', 'error', 'Please load a cover image first.'); return; }

    const isFileMode = document.getElementById('enc-file-toggle').classList.contains('on');
    const useAES = document.getElementById('enc-aes-toggle').classList.contains('on');
    const useScatter = document.getElementById('enc-scatter-toggle').classList.contains('on');
    const lsbDepth = getBits('bit-selector');
    const passphrase = document.getElementById('enc-pass').value;
    const pass2 = document.getElementById('enc-pass2').value;
    const seed = document.getElementById('enc-seed').value;

    if (useAES) {
      if (!passphrase) { showAlert('enc-alert-box', 'error', 'Enter a passphrase for AES encryption.'); return; }
      if (passphrase !== pass2) { showAlert('enc-alert-box', 'error', 'Passphrases do not match.'); return; }
    }

    let message, fileMode = false, fileName = '', fileType = '';
    if (isFileMode) {
      if (!this.secretFile) { showAlert('enc-alert-box', 'error', 'Select a file to embed.'); return; }
      message = this.secretFile.bytes;
      fileMode = true;
      fileName = this.secretFile.name;
      fileType = this.secretFile.type;
    } else {
      message = document.getElementById('enc-message').value;
      if (!message.trim()) { showAlert('enc-alert-box', 'error', 'Enter a secret message.'); return; }
    }

    const btn = document.getElementById('enc-btn');
    btn.disabled = true;
    document.getElementById('enc-loader').style.display = 'block';
    Status.set('Encoding…', true);

    await new Promise(r => setTimeout(r, 30));

    try {
      const { canvas, metrics } = Stego.encode(img, message, {
        lsbDepth, encrypt: useAES && !fileMode, passphrase, scatter: useScatter, seed,
        fileMode, fileName, fileType
      });

      const link = document.createElement('a');
      link.download = `stego_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      // Show result
      document.getElementById('enc-result').style.display = 'block';
      document.getElementById('r-dims').textContent = `${img.width}×${img.height}`;
      document.getElementById('r-psnr').textContent = metrics.psnr + ' dB';
      document.getElementById('r-ssim').textContent = metrics.mse;
      document.getElementById('r-lsb').textContent = lsbDepth;
      document.getElementById('r-bytes').textContent = formatBytes(fileMode ? message.length : new TextEncoder().encode(message).length);
      document.getElementById('r-enc').textContent = (useAES && !fileMode) ? 'AES-256' : 'None';

      this._renderLSBPlane(canvas);

      showAlert('enc-alert-box', 'success', `Encoded successfully! PNG downloaded. PSNR: ${metrics.psnr} dB`);
      Toast.show('Image encoded and downloaded', 'success');

      Log.add('encode', {
        dims: `${img.width}×${img.height}`, lsb: lsbDepth,
        bytes: fileMode ? message.length : new TextEncoder().encode(message).length,
        encrypted: useAES, scatter: useScatter, psnr: metrics.psnr,
        fileMode, fileName
      });

    } catch (err) {
      showAlert('enc-alert-box', 'error', err.message);
      Toast.show(err.message, 'error');
    }

    btn.disabled = false;
    document.getElementById('enc-loader').style.display = 'none';
    Status.ready();
  },

  /* ── Decode ── */
  async decode() {
    clearAlert('dec-alert-box');
    const img = this.images['decode'];
    if (!img) { showAlert('dec-alert-box', 'error', 'Please load a stego image.'); return; }

    const useAES = document.getElementById('dec-aes-toggle').classList.contains('on');
    const useScatter = document.getElementById('dec-scatter-toggle').classList.contains('on');
    const lsbDepth = getBits('dec-bit-selector');
    const passphrase = document.getElementById('dec-pass').value;
    const seed = document.getElementById('dec-seed').value;

    if (useAES && !passphrase) { showAlert('dec-alert-box', 'error', 'Enter the decryption passphrase.'); return; }

    const btn = document.getElementById('dec-btn');
    btn.disabled = true;
    document.getElementById('dec-loader').style.display = 'block';
    Status.set('Decoding…', true);

    await new Promise(r => setTimeout(r, 30));

    try {
      const result = Stego.decode(img, {
        lsbDepth, decrypt: useAES, passphrase, scatter: useScatter, seed
      });

      if (result.isFile) {
        // File mode — offer download
        const blob = new Blob([result.fileData], { type: result.fileType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const dl = document.createElement('a');
        dl.href = url; dl.download = result.fileName || 'extracted_file';
        dl.click(); URL.revokeObjectURL(url);

        document.getElementById('decoded-output').style.display = 'block';
        document.getElementById('decoded-text').textContent = `[File extracted: ${result.fileName}]\nType: ${result.fileType}\nSize: ${formatBytes(result.fileData.length)}`;
        document.getElementById('decoded-stats').innerHTML = `type: ${result.fileType} &nbsp;·&nbsp; size: ${formatBytes(result.fileData.length)} &nbsp;·&nbsp; lsb: ${result.stats.lsb}`;
        showAlert('dec-alert-box', 'success', `File "${result.fileName}" extracted and downloaded.`);
        Toast.show('File extracted', 'success');

      } else {
        document.getElementById('decoded-output').style.display = 'block';
        document.getElementById('decoded-text').textContent = result.text;
        document.getElementById('decoded-stats').innerHTML =
          `${result.stats.chars} chars &nbsp;·&nbsp; ${formatBytes(result.stats.bytes)} &nbsp;·&nbsp; lsb: ${result.stats.lsb} &nbsp;·&nbsp; encrypted: ${result.stats.encrypted ? 'yes' : 'no'}`;

        showAlert('dec-alert-box', 'success', `Decoded! ${result.stats.chars} characters extracted.`);
        Toast.show('Message decoded successfully', 'success');
      }

      Log.add('decode', {
        dims: `${img.width}×${img.height}`, lsb: lsbDepth,
        bytes: result.stats?.bytes, encrypted: result.stats?.encrypted,
        fileMode: result.isFile, fileName: result.fileName
      });

    } catch (err) {
      showAlert('dec-alert-box', 'error', err.message);
      Toast.show(err.message, 'error');
    }

    btn.disabled = false;
    document.getElementById('dec-loader').style.display = 'none';
    Status.ready();
  },

  copyDecoded() {
    const text = document.getElementById('decoded-text').textContent;
    navigator.clipboard.writeText(text).then(() => Toast.show('Copied to clipboard', 'success'));
  },

  downloadDecoded() {
    const text = document.getElementById('decoded-text').textContent;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'decoded_message.txt'; a.click();
    URL.revokeObjectURL(url);
    Toast.show('Message downloaded', 'success');
  },

  /* ── LSB Plane Preview ── */
  _renderLSBPlane(srcCanvas) {
    const canvas = document.getElementById('lsb-plane-canvas');
    const ctx = canvas.getContext('2d');
    const W = 256, H = 64;
    canvas.width = W; canvas.height = H;

    const tmp = document.createElement('canvas');
    tmp.width = srcCanvas.width; tmp.height = srcCanvas.height;
    const tmpCtx = tmp.getContext('2d');
    tmpCtx.drawImage(srcCanvas, 0, 0);
    const src = tmpCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;

    const out = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.floor(x / W * srcCanvas.width);
        const sy = Math.floor(y / H * srcCanvas.height);
        const si = (sy * srcCanvas.width + sx) * 4;
        const oi = (y * W + x) * 4;
        const r = (src[si] & 1) * 255;
        const g = (src[si + 1] & 1) * 255;
        const b = (src[si + 2] & 1) * 255;
        out.data[oi] = r;
        out.data[oi + 1] = g;
        out.data[oi + 2] = b;
        out.data[oi + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  },

  /* ── Password strength ── */
  _initPassStrength() {
    document.getElementById('enc-pass').addEventListener('input', e => {
      const s = evalPasswordStrength(e.target.value);
      document.getElementById('strength-fill').style.width = s.pct + '%';
      document.getElementById('strength-fill').style.background = s.color;
      document.getElementById('strength-label').textContent = s.label;
    });
  },

  _restoreSettings() {
    // Future: restore from localStorage
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
