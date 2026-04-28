// log.js — Session activity log

const Log = {
  entries: [],

  add(type, info) {
    const entry = { type, info, time: new Date().toLocaleTimeString() };
    this.entries.unshift(entry);
    this._updateBadge();
    this._render();
  },

  clear() {
    this.entries = [];
    this._updateBadge();
    this._render();
    Toast.show('Log cleared', 'info');
  },

  _updateBadge() {
    const badge = document.getElementById('log-count');
    if (this.entries.length > 0) {
      badge.style.display = 'block';
      badge.textContent = this.entries.length;
    } else {
      badge.style.display = 'none';
    }
  },

  _render() {
    const list = document.getElementById('log-list');
    const ph = document.getElementById('log-placeholder');
    list.innerHTML = '';

    if (!this.entries.length) {
      ph.style.display = 'flex';
      return;
    }

    ph.style.display = 'none';

    this.entries.forEach(({ type, info, time }) => {
      const typeLabels = {
        encode: ['ENCODE', 'badge-encode'],
        decode: ['DECODE', 'badge-decode'],
        batch: ['BATCH', 'badge-batch'],
        analyze: ['ANALYZE', 'badge-analyze']
      };
      const [label, cls] = typeLabels[type] || ['OP', 'badge-encode'];

      let detail = '';
      if (type === 'encode') {
        detail = `${info.dims} · ${info.lsb} LSB · ${info.bytes ? info.bytes + ' B' : '—'} · PSNR ${info.psnr} dB` +
          (info.encrypted ? ' · AES-256' : '') +
          (info.scatter ? ' · scattered' : '') +
          (info.fileMode ? ` · file: ${info.fileName}` : '');
      } else if (type === 'decode') {
        detail = `${info.dims} · ${info.lsb} LSB` +
          (info.encrypted ? ' · decrypted AES' : '') +
          (info.fileMode ? ` · file: ${info.fileName}` : ` · ${info.bytes ? info.bytes + ' B' : ''}`);
      } else if (type === 'batch') {
        detail = `${info.count} images · ${info.lsb} LSB${info.encrypted ? ' · AES' : ''}`;
      } else if (type === 'analyze') {
        detail = info.dims;
      }

      const el = document.createElement('div');
      el.className = 'log-entry';
      el.innerHTML = `
        <span class="log-badge ${cls}">${label}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${detail}</span>
        <span class="log-time">${time}</span>
      `;
      list.appendChild(el);
    });
  }
};
