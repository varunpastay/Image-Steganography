// batch.js — Batch encode multiple images

const Batch = {
  files: [],

  loadFiles(input) {
    const newFiles = Array.from(input.files || []);
    if (!newFiles.length) return;

    this.files = [...this.files, ...newFiles].slice(0, 20); // max 20
    document.getElementById('batch-count').textContent = `${this.files.length} image${this.files.length !== 1 ? 's' : ''} loaded`;
    this._renderThumbs();
  },

  _renderThumbs() {
    const container = document.getElementById('batch-thumbs');
    container.innerHTML = '';
    this.files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = e => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block';

        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'batch-thumb';
        img.title = file.name;

        const rm = document.createElement('button');
        rm.innerHTML = '✕';
        rm.style.cssText = `
          position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;
          background:#ff5f7e;color:#fff;border:none;cursor:pointer;font-size:9px;
          display:flex;align-items:center;justify-content:center;line-height:1;
        `;
        rm.onclick = () => { this.files.splice(i, 1); this._renderThumbs(); document.getElementById('batch-count').textContent = `${this.files.length} images loaded`; };

        wrap.appendChild(img);
        wrap.appendChild(rm);
        container.appendChild(wrap);
      };
      reader.readAsDataURL(file);
    });
  },

  async processAll() {
    const message = document.getElementById('batch-message').value.trim();
    if (!message) { showAlert('batch-alert-box', 'error', 'Enter a message to embed.'); return; }
    if (!this.files.length) { showAlert('batch-alert-box', 'error', 'Load at least one image.'); return; }

    const lsbDepth = getBits('batch-bit-selector');
    const useAES = document.getElementById('batch-aes-toggle').classList.contains('on');
    const passphrase = document.getElementById('batch-pass').value;

    if (useAES && !passphrase) { showAlert('batch-alert-box', 'error', 'Enter an encryption passphrase.'); return; }

    const prog = document.getElementById('batch-progress');
    const progFill = document.getElementById('prog-fill');
    const progLabel = document.getElementById('prog-label');
    prog.style.display = 'block';
    clearAlert('batch-alert-box');

    Status.set('Batch processing…', true);

    const zip = typeof JSZip !== 'undefined' ? new JSZip() : null;
    let done = 0;

    for (const file of this.files) {
      const src = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });

      const img = await loadImageFromSrc(src);
      progLabel.textContent = `Processing ${file.name}… (${done + 1}/${this.files.length})`;
      progFill.style.width = ((done / this.files.length) * 100) + '%';

      try {
        const { canvas } = Stego.encode(img, message, {
          lsbDepth, encrypt: useAES, passphrase, scatter: false, seed: ''
        });

        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const name = file.name.replace(/\.[^.]+$/, '') + '_stego.png';

        if (zip) {
          zip.file(name, blob);
        } else {
          // Fallback: download individually
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = name; a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.warn(`Failed: ${file.name}`, err.message);
      }

      done++;
      await new Promise(r => setTimeout(r, 10));
    }

    progFill.style.width = '100%';

    if (zip) {
      progLabel.textContent = 'Zipping files…';
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url; a.download = `stego_batch_${Date.now()}.zip`; a.click();
      URL.revokeObjectURL(url);
    }

    progLabel.textContent = `Done! ${done} image${done !== 1 ? 's' : ''} processed.`;
    showAlert('batch-alert-box', 'success', `${done} images encoded and downloaded as ZIP.`);
    Toast.show(`Batch complete: ${done} images`, 'success');

    Log.add('batch', { count: done, lsb: lsbDepth, encrypted: useAES });
    Status.ready();
  }
};
