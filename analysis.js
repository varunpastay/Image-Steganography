// analysis.js — Statistical analysis, compare, stealth check, LSB visualizer

const Analysis = {
  async run() {
    const img = App.images['analyze'];
    if (!img) { Toast.show('Load an image to analyze', 'error'); return; }

    Status.set('Analyzing…', true);
    await new Promise(r => setTimeout(r, 30));

    const { canvas, data } = getImageData(img);
    const px = data.data;

    // Channel stats
    const stats = { r: [], g: [], b: [] };
    for (let i = 0; i < px.length; i += 4) {
      stats.r.push(px[i]);
      stats.g.push(px[i + 1]);
      stats.b.push(px[i + 2]);
    }

    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr => { const m = mean(arr); return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length; };
    const entropy = arr => {
      const freq = new Array(256).fill(0);
      arr.forEach(v => freq[v]++);
      const n = arr.length;
      return -freq.filter(f => f > 0).reduce((s, f) => s + (f / n) * Math.log2(f / n), 0);
    };

    const lsbBias = arr => {
      const ones = arr.filter(v => (v & 1) === 1).length;
      return ((ones / arr.length) * 100).toFixed(2);
    };

    const rm = mean(stats.r).toFixed(2), gm = mean(stats.g).toFixed(2), bm = mean(stats.b).toFixed(2);
    const rv = variance(stats.r).toFixed(2), gv = variance(stats.g).toFixed(2), bv = variance(stats.b).toFixed(2);
    const re = entropy(stats.r).toFixed(4), ge = entropy(stats.g).toFixed(4), be = entropy(stats.b).toFixed(4);
    const rlsb = lsbBias(stats.r), glsb = lsbBias(stats.g), blsb = lsbBias(stats.b);

    const grid = document.getElementById('analysis-grid');
    grid.innerHTML = [
      ['R Mean', rm], ['R Entropy', re],
      ['G Mean', gm], ['G Entropy', ge],
      ['B Mean', bm], ['B Entropy', be],
      ['R Variance', rv], ['R LSB 1s', rlsb + '%'],
      ['G Variance', gv], ['G LSB 1s', glsb + '%'],
      ['B Variance', bv], ['B LSB 1s', blsb + '%'],
      ['Pixels', (stats.r.length).toLocaleString()], ['Dimensions', `${img.width}×${img.height}`]
    ].map(([k, v]) => `<div class="ana-item"><span class="ana-k">${k}</span><span class="ana-v">${v}</span></div>`).join('');

    this._drawHistogram(stats);
    this._drawLSBDist(stats);
    this._computeSuspicion(parseFloat(re), parseFloat(ge), parseFloat(be), parseFloat(rlsb), parseFloat(glsb), parseFloat(blsb));

    document.getElementById('analysis-results').style.display = 'block';
    document.getElementById('analyze-placeholder').style.display = 'none';

    Log.add('analyze', { dims: `${img.width}×${img.height}` });
    Status.ready();
  },

  _drawHistogram(stats) {
    const canvas = document.getElementById('histogram-canvas');
    const W = canvas.offsetWidth || 480, H = 140;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const isDark = !document.body.classList.contains('light');
    ctx.fillStyle = isDark ? '#1a1a28' : '#f0f0f8';
    ctx.fillRect(0, 0, W, H);

    const channels = [
      { data: stats.r, color: 'rgba(255,80,80,0.7)' },
      { data: stats.g, color: 'rgba(80,200,80,0.7)' },
      { data: stats.b, color: 'rgba(80,140,255,0.7)' }
    ];

    for (const { data, color } of channels) {
      const freq = new Array(256).fill(0);
      data.forEach(v => freq[v]++);
      const max = Math.max(...freq);

      ctx.beginPath();
      ctx.fillStyle = color;
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * W;
        const h = (freq[i] / max) * (H - 10);
        ctx.fillRect(x, H - h - 2, W / 256 + 1, h);
      }
    }
  },

  _drawLSBDist(stats) {
    const canvas = document.getElementById('lsb-dist-canvas');
    const W = canvas.offsetWidth || 480, H = 100;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const isDark = !document.body.classList.contains('light');
    ctx.fillStyle = isDark ? '#1a1a28' : '#f0f0f8';
    ctx.fillRect(0, 0, W, H);

    const channels = [
      { data: stats.r, color: '#ff5050', label: 'R' },
      { data: stats.g, color: '#50c850', label: 'G' },
      { data: stats.b, color: '#5090ff', label: 'B' }
    ];

    const barW = W / 3 - 16;

    channels.forEach(({ data, color, label }, ci) => {
      const ones = data.filter(v => (v & 1) === 1).length;
      const pct = ones / data.length;
      const x = ci * (W / 3) + 8;

      // Background
      ctx.fillStyle = isDark ? '#22223a' : '#ddddf0';
      ctx.beginPath();
      ctx.roundRect(x, 10, barW, H - 25, 4);
      ctx.fill();

      // Fill
      ctx.fillStyle = color;
      const fillH = pct * (H - 25);
      ctx.beginPath();
      ctx.roundRect(x, 10 + (H - 25) - fillH, barW, fillH, 4);
      ctx.fill();

      // Label
      ctx.fillStyle = isDark ? '#eeeeff' : '#111122';
      ctx.font = '11px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${label}: ${(pct * 100).toFixed(1)}%`, x + barW / 2, H - 4);
    });
  },

  _computeSuspicion(re, ge, be, rlsb, glsb, blsb) {
    let score = 0;

    // High entropy near 8 = suspicious (natural images typically < 7.5)
    if (re > 7.8) score += 20;
    else if (re > 7.5) score += 10;

    // LSB close to exactly 50% = suspicious (random bits)
    const lsbDev = [rlsb, glsb, blsb].reduce((s, v) => s + Math.abs(v - 50), 0) / 3;
    if (lsbDev < 1.5) score += 40;
    else if (lsbDev < 3) score += 20;
    else if (lsbDev < 6) score += 5;

    score = Math.min(100, score);

    const verdicts = [
      [80, '⚠ HIGH — Strong indicators of embedded data. LSB distribution is near-random (50/50 split).'],
      [50, '⚡ MODERATE — Some statistical anomalies detected. Could be steganographic content.'],
      [20, '✓ LOW — Minor irregularities. Likely a clean image.'],
      [0,  '✓ CLEAN — No significant steganographic indicators detected.']
    ];

    const [, verdict] = verdicts.find(([t]) => score >= t) || verdicts[verdicts.length - 1];

    const fill = document.getElementById('susp-fill');
    fill.style.width = score + '%';
    fill.style.background = score >= 70 ? '#ff5f7e' : score >= 40 ? '#ffc04a' : '#2dd98a';
    document.getElementById('susp-score').textContent = score + '%';
    document.getElementById('susp-verdict').textContent = verdict;
    document.getElementById('suspicion-meter').style.display = 'block';
  }
};

/* ── Compare ── */
const Compare = {
  async run() {
    const orig = App.images['cmp-orig'];
    const stego = App.images['cmp-stego'];
    if (!orig || !stego) { Toast.show('Load both images first', 'error'); return; }
    if (orig.width !== stego.width || orig.height !== stego.height) {
      Toast.show('Images must be the same dimensions', 'error'); return;
    }

    Status.set('Comparing…', true);
    await new Promise(r => setTimeout(r, 30));

    const { data: d1 } = getImageData(orig);
    const { data: d2 } = getImageData(stego);
    const p1 = d1.data, p2 = d2.data;

    // Diff map amplified x20
    const diffCanvas = document.getElementById('diff-canvas');
    diffCanvas.width = orig.width; diffCanvas.height = orig.height;
    const ctx = diffCanvas.getContext('2d');
    const out = ctx.createImageData(orig.width, orig.height);

    let mse = 0, n = 0, maxDiff = 0;
    for (let i = 0; i < p1.length; i++) {
      if ((i + 1) % 4 === 0) { out.data[i] = 255; continue; }
      const diff = Math.abs(p1[i] - p2[i]);
      const amp = Math.min(255, diff * 20);
      out.data[i] = amp;
      if ((i + 1) % 4 !== 0) { mse += diff * diff; n++; maxDiff = Math.max(maxDiff, diff); }
    }
    ctx.putImageData(out, 0, 0);

    mse /= n;
    const psnr = mse === 0 ? '∞' : (10 * Math.log10(255 * 255 / mse)).toFixed(2);
    const changedPx = (() => { let c = 0; for (let i = 0; i < p1.length; i += 4) if (p1[i] !== p2[i] || p1[i+1] !== p2[i+1] || p1[i+2] !== p2[i+2]) c++; return c; })();
    const totalPx = orig.width * orig.height;

    const metrics = document.getElementById('compare-metrics');
    metrics.innerHTML = [
      ['PSNR', psnr + (psnr === '∞' ? '' : ' dB')],
      ['MSE', mse.toFixed(4)],
      ['Max Δ', maxDiff],
      ['Δ Pixels', `${changedPx.toLocaleString()} (${(changedPx/totalPx*100).toFixed(2)}%)`]
    ].map(([k, v]) => `<div class="metric"><span class="metric-v">${v}</span><span class="metric-k">${k}</span></div>`).join('');

    document.getElementById('compare-output').style.display = 'block';
    Status.ready();
    Toast.show('Comparison complete', 'success');
  }
};

/* ── Stealth Check ── */
const Stealth = {
  async run() {
    const orig = App.images['st-orig'];
    const stego = App.images['st-stego'];
    if (!orig || !stego) { Toast.show('Load both images first', 'error'); return; }
    if (orig.width !== stego.width || orig.height !== stego.height) {
      Toast.show('Images must have the same dimensions', 'error'); return;
    }

    Status.set('Checking stealth…', true);
    await new Promise(r => setTimeout(r, 30));

    const { data: d1 } = getImageData(orig);
    const { data: d2 } = getImageData(stego);
    const p1 = d1.data, p2 = d2.data;

    let mse = 0, n = 0;
    for (let i = 0; i < p1.length; i++) {
      if ((i + 1) % 4 === 0) continue;
      mse += (p1[i] - p2[i]) ** 2; n++;
    }
    mse /= n;
    const psnr = mse === 0 ? 100 : 10 * Math.log10(255 * 255 / mse);

    const grade = v => {
      if (v >= 50) return { g: 'A', cls: 'grade-A', note: 'Excellent — imperceptible' };
      if (v >= 40) return { g: 'B', cls: 'grade-B', note: 'Good — barely perceptible' };
      if (v >= 30) return { g: 'C', cls: 'grade-C', note: 'Moderate — may be visible under scrutiny' };
      return { g: 'D', cls: 'grade-D', note: 'Poor — visible degradation' };
    };

    const pg = grade(psnr);

    const report = document.getElementById('stealth-report');
    report.innerHTML = [
      { k: 'PSNR', v: psnr.toFixed(2) + ' dB', grade: pg },
      { k: 'MSE', v: mse.toFixed(6), grade: null },
      { k: 'Verdict', v: pg.note, grade: pg },
      { k: 'Imperceptibility', v: psnr >= 40 ? 'High' : psnr >= 30 ? 'Moderate' : 'Low', grade: pg }
    ].map(row => `
      <div class="stealth-row">
        <span class="stealth-k">${row.k}</span>
        <span class="stealth-v">${row.v}</span>
        ${row.grade ? `<span class="stealth-grade ${row.grade.cls}">${row.grade.g}</span>` : ''}
      </div>
    `).join('');

    document.getElementById('stealth-results').style.display = 'block';
    Status.ready();
    Toast.show('Stealth check complete', 'success');
  }
};

/* ── LSB Visualizer ── */
const LSBViz = {
  channel: 'r',
  bitPlane: 0,

  setChannel(ch, btn) {
    this.channel = ch;
    document.querySelectorAll('.ch-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  },

  async render() {
    const img = App.images['lsb'];
    if (!img) { Toast.show('Load an image first', 'error'); return; }

    const plane = getBits('viz-bit-selector');
    this.bitPlane = plane;

    Status.set('Rendering bit plane…', true);
    await new Promise(r => setTimeout(r, 20));

    const { canvas: src } = getImageData(img);
    const sCtx = src.getContext('2d');
    const px = sCtx.getImageData(0, 0, src.width, src.height).data;

    const outCanvas = document.getElementById('bitplane-canvas');
    outCanvas.width = img.width;
    outCanvas.height = img.height;
    const ctx = outCanvas.getContext('2d');
    const out = ctx.createImageData(img.width, img.height);

    const chIdx = { r: 0, g: 1, b: 2 };
    const bit = 1 << plane;

    for (let i = 0; i < px.length; i += 4) {
      const oi = i;
      if (this.channel === 'all') {
        const v = ((px[i] & bit) ? 85 : 0) + ((px[i+1] & bit) ? 85 : 0) + ((px[i+2] & bit) ? 85 : 0);
        out.data[oi] = out.data[oi+1] = out.data[oi+2] = v;
      } else {
        const ci = chIdx[this.channel];
        const v = (px[i + ci] & bit) ? 255 : 0;
        out.data[oi] = this.channel === 'r' ? v : 0;
        out.data[oi+1] = this.channel === 'g' ? v : 0;
        out.data[oi+2] = this.channel === 'b' ? v : this.channel === 'all' ? v : 0;
      }
      out.data[oi+3] = 255;
    }

    ctx.putImageData(out, 0, 0);

    document.getElementById('lsb-output-card').style.display = 'block';
    document.getElementById('lsb-placeholder').style.display = 'none';
    document.getElementById('lsb-plane-label').textContent =
      `Channel: ${this.channel.toUpperCase()} · Bit plane: ${plane} (${plane === 0 ? 'LSB' : plane === 7 ? 'MSB' : 'bit ' + plane})`;

    Status.ready();
  }
};
