// stego.js — Core LSB steganography engine

const Stego = {

  /**
   * Encode payload bits into image pixel data (LSB method)
   */
  embedBits(data, bits, lsbDepth, scatter, seed) {
    const mask = (1 << lsbDepth) - 1;

    // Build index list of writable channel positions
    const indices = [];
    for (let i = 0; i < data.length; i++) {
      if ((i + 1) % 4 !== 0) indices.push(i);
    }

    // Optionally shuffle for scatter mode
    if (scatter && seed) seededShuffle(indices, seed);

    let bitIdx = 0;
    for (const idx of indices) {
      if (bitIdx >= bits.length) break;
      const chunk = bits.slice(bitIdx, bitIdx + lsbDepth).padEnd(lsbDepth, '0');
      data[idx] = (data[idx] & ~mask) | parseInt(chunk, 2);
      bitIdx += lsbDepth;
    }
  },

  /**
   * Extract bits from image pixel data
   */
  extractBits(data, count, lsbDepth, scatter, seed) {
    const mask = (1 << lsbDepth) - 1;
    const indices = [];
    for (let i = 0; i < data.length; i++) {
      if ((i + 1) % 4 !== 0) indices.push(i);
    }
    if (scatter && seed) seededShuffle(indices, seed);

    let bits = '';
    let bitsNeeded = count * 8;
    for (const idx of indices) {
      if (bits.length >= bitsNeeded) break;
      bits += (data[idx] & mask).toString(2).padStart(lsbDepth, '0');
    }
    return bits;
  },

  /**
   * Build the 128-byte header JSON
   */
  buildHeader(payloadLen, opts) {
    const h = JSON.stringify({
      v: 3,
      len: payloadLen,
      bits: opts.lsbDepth,
      enc: opts.encrypt,
      scatter: opts.scatter,
      fileMode: opts.fileMode || false,
      fileName: opts.fileName || '',
      fileType: opts.fileType || ''
    });
    return h.padEnd(HEADER_SIZE, ' ').slice(0, HEADER_SIZE);
  },

  /**
   * Parse header from raw extracted header string
   */
  parseHeader(raw) {
    try {
      return JSON.parse(raw.trim());
    } catch {
      return null;
    }
  },

  /**
   * Full encode operation
   * Returns { canvas, metrics } or throws
   */
  encode(img, message, opts) {
    const { lsbDepth, encrypt, passphrase, scatter, seed, fileMode, fileName, fileType } = opts;

    // Prepare payload
    let payload;
    if (fileMode && message instanceof Uint8Array) {
      payload = message;
    } else {
      let text = message;
      if (encrypt) {
        if (!passphrase) throw new Error('Passphrase required for encryption');
        const encrypted = CryptoJS.AES.encrypt(text, passphrase).toString();
        text = 'ENC:' + encrypted;
      }
      payload = new TextEncoder().encode(text);
    }

    const header = this.buildHeader(payload.length, {
      lsbDepth, encrypt, scatter, fileMode,
      fileName: fileName || '', fileType: fileType || ''
    });
    const headerBytes = new TextEncoder().encode(header);

    // Combined: header + payload
    const combined = new Uint8Array(headerBytes.length + payload.length);
    combined.set(headerBytes, 0);
    combined.set(payload, headerBytes.length);

    const totalBits = bytesToBits(combined);

    // Capacity check
    const capacity = Math.floor(img.width * img.height * 3 * lsbDepth / 8) * 8;
    if (totalBits.length > capacity) {
      throw new Error(`Message too large. Need ${Math.ceil(totalBits.length / 8)} bytes, image holds ${Math.floor(capacity / 8)} bytes at ${lsbDepth} LSB.`);
    }

    // Draw image to canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const origData = new Uint8ClampedArray(imageData.data); // copy for metrics

    this.embedBits(imageData.data, totalBits, lsbDepth, scatter, seed);
    ctx.putImageData(imageData, 0, 0);

    const metrics = computeMetrics(origData, imageData.data);

    return { canvas, metrics };
  },

  /**
   * Full decode operation
   * Returns { text, isFile, fileName, fileType, fileData, stats } or throws
   */
  decode(img, opts) {
    const { lsbDepth, decrypt, passphrase, scatter, seed } = opts;

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Extract header first
    const headerBits = this.extractBits(data, HEADER_SIZE, lsbDepth, scatter, seed);
    const headerText = bitsToText(headerBits);
    const header = this.parseHeader(headerText);

    if (!header || header.v !== 3) {
      throw new Error('No valid StegoVault v3 header found. Check LSB depth and scatter settings match the encoding.');
    }

    const totalBytes = HEADER_SIZE + header.len;
    const allBits = this.extractBits(data, totalBytes, lsbDepth, scatter, seed);
    const payloadBits = allBits.slice(HEADER_SIZE * 8, totalBytes * 8);
    const payloadBytes = bitsToBytes(payloadBits);

    if (header.fileMode) {
      return {
        isFile: true,
        fileName: header.fileName,
        fileType: header.fileType,
        fileData: payloadBytes,
        stats: { bytes: payloadBytes.length, encrypted: header.enc, lsb: header.bits }
      };
    }

    let text = new TextDecoder().decode(payloadBytes);

    if (text.startsWith('ENC:')) {
      if (!passphrase) throw new Error('This message is encrypted. Enable decryption and enter the passphrase.');
      try {
        const decrypted = CryptoJS.AES.decrypt(text.slice(4), passphrase);
        text = decrypted.toString(CryptoJS.enc.Utf8);
        if (!text) throw new Error('Wrong passphrase or corrupted data.');
      } catch (e) {
        throw new Error('Decryption failed: ' + e.message);
      }
    }

    return {
      isFile: false,
      text,
      stats: { chars: text.length, bytes: payloadBytes.length, encrypted: header.enc, lsb: header.bits }
    };
  },

  /**
   * Capacity calculation
   */
  capacity(img, lsbDepth) {
    return Math.floor(img.width * img.height * 3 * lsbDepth / 8) - HEADER_SIZE;
  }
};
