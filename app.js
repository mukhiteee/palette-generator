(() => {
  // Default curated palette (Blue-led, zero green)
  const DEFAULT_PALETTE = [
    { id: 'c1', hex: '#2563EB', name: 'Cobalt Blue', label: 'Primary Brand' },
    { id: 'c2', hex: '#0F172A', name: 'Midnight Slate', label: 'Ink / Text' },
    { id: 'c3', hex: '#38BDF8', name: 'Sky Azure', label: 'Secondary' },
    { id: 'c4', hex: '#F59E0B', name: 'Solar Amber', label: 'Accent' },
    { id: 'c5', hex: '#F8FAFC', name: 'Porcelain Mist', label: 'Surface / BG' }
  ];

  let palette = JSON.parse(localStorage.getItem('palette_gen_swatches')) || [...DEFAULT_PALETTE];
  let currentDesign = 'horizontal-lines';
  let displayFormat = 'HEX';
  let exportFormat = 'png';
  let canvasDimensions = { width: 1600, height: 1000 };
  let isDark = false;

  // DOM Elements
  const nativeColorPicker = document.getElementById('nativeColorPicker');
  const colorCodeInput = document.getElementById('colorCodeInput');
  const colorNameInput = document.getElementById('colorNameInput');
  const colorLabelInput = document.getElementById('colorLabelInput');
  const formatDetectedHint = document.getElementById('formatDetectedHint');
  const addColorForm = document.getElementById('addColorForm');
  const paletteList = document.getElementById('paletteList');
  const swatchCount = document.getElementById('swatchCount');
  const brandTitleInput = document.getElementById('brandTitleInput');
  const designStyleGroup = document.getElementById('designStyleGroup');
  const displayFormatSelect = document.getElementById('displayFormatSelect');
  const exportFormatSelect = document.getElementById('exportFormatSelect');
  const aspectRatioSelect = document.getElementById('aspectRatioSelect');
  const paletteCanvas = document.getElementById('paletteCanvas');
  const exportMetaText = document.getElementById('exportMetaText');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyCssBtn = document.getElementById('copyCssBtn');
  const loadPresetBtn = document.getElementById('loadPresetBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const toastEl = document.getElementById('toast');

  const ctx = paletteCanvas.getContext('2d');

  // --- Color Conversion & Multi-Format Parsing Utilities ---
  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function componentToHex(c) {
    const hex = clamp(Math.round(c), 0, 255).toString(16).toUpperCase();
    return hex.length === 1 ? '0' + hex : hex;
  }

  function rgbToHex(r, g, b) {
    return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean.slice(0, 6);
    const num = parseInt(full, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToCmyk(r, g, b) {
    if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
    const rP = r / 255, gP = g / 255, bP = b / 255;
    const k = 1 - Math.max(rP, gP, bP);
    const c = (1 - rP - k) / (1 - k);
    const m = (1 - gP - k) / (1 - k);
    const y = (1 - bP - k) / (1 - k);
    return {
      c: Math.round(c * 100),
      m: Math.round(m * 100),
      y: Math.round(y * 100),
      k: Math.round(k * 100)
    };
  }

  function cmykToRgb(c, m, y, k) {
    c /= 100; m /= 100; y /= 100; k /= 100;
    return {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k))
    };
  }

  function parseAnyColor(input) {
    const raw = input.trim();
    if (!raw) return null;

    // 1. HEX (#FFF or #FFFFFF)
    const hexMatch = raw.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hexMatch) {
      let h = hexMatch[1];
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      return { hex: '#' + h.toUpperCase(), format: 'HEX' };
    }

    // 2. RGB / RGBA
    const rgbMatch = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
    if (rgbMatch) {
      const r = clamp(parseInt(rgbMatch[1], 10), 0, 255);
      const g = clamp(parseInt(rgbMatch[2], 10), 0, 255);
      const b = clamp(parseInt(rgbMatch[3], 10), 0, 255);
      return { hex: rgbToHex(r, g, b), format: 'RGB' };
    }

    // 3. HSL / HSLA
    const hslMatch = raw.match(/^hsla?\(\s*(\d{1,3})(?:deg)?\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%(?:\s*,\s*[\d.]+)?\s*\)$/i);
    if (hslMatch) {
      const rgb = hslToRgb(parseInt(hslMatch[1], 10), parseInt(hslMatch[2], 10), parseInt(hslMatch[3], 10));
      return { hex: rgbToHex(rgb.r, rgb.g, rgb.b), format: 'HSL' };
    }

    // 4. CMYK
    const cmykMatch = raw.match(/^cmyk\(\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*\)$/i);
    if (cmykMatch) {
      const rgb = cmykToRgb(
        clamp(parseInt(cmykMatch[1], 10), 0, 100),
        clamp(parseInt(cmykMatch[2], 10), 0, 100),
        clamp(parseInt(cmykMatch[3], 10), 0, 100),
        clamp(parseInt(cmykMatch[4], 10), 0, 100)
      );
      return { hex: rgbToHex(rgb.r, rgb.g, rgb.b), format: 'CMYK' };
    }

    // 5. Browser CSS color fallback
    const probe = document.createElement('div');
    probe.style.color = raw;
    if (probe.style.color) {
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const m = computed.match(/\d+/g);
      if (m && m.length >= 3) {
        return { hex: rgbToHex(+m[0], +m[1], +m[2]), format: 'CSS Named' };
      }
    }

    return null;
  }

  function suggestColorName(hex) {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l >= 94) return 'Alabaster White';
    if (l <= 12) return 'Obsidian Ink';
    if (s <= 12) return l > 55 ? 'Silver Slate' : 'Graphite Steel';

    let tone = '';
    if (l > 72) tone = 'Soft ';
    else if (l < 32) tone = 'Deep ';
    else if (s > 78) tone = 'Vivid ';

    let hueName = 'Blue';
    if (h < 15 || h >= 345) hueName = 'Crimson';
    else if (h < 40) hueName = 'Tangerine';
    else if (h < 62) hueName = 'Amber Gold';
    else if (h < 165) hueName = 'Teal';
    else if (h < 205) hueName = 'Cerulean';
    else if (h < 245) hueName = 'Cobalt Blue';
    else if (h < 275) hueName = 'Royal Indigo';
    else if (h < 310) hueName = 'Electric Violet';
    else hueName = 'Magenta Rose';

    return tone + hueName;
  }

  function formatColorCode(hex, format) {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    const { c, m, y, k } = rgbToCmyk(r, g, b);

    switch (format) {
      case 'RGB':
        return `rgb(${r}, ${g}, ${b})`;
      case 'HSL':
        return `hsl(${h}°, ${s}%, ${l}%)`;
      case 'CMYK':
        return `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`;
      case 'ALL':
        return `${hex.toUpperCase()}  •  RGB(${r}, ${g}, ${b})  •  CMYK(${c},${m},${y},${k})`;
      case 'HEX':
      default:
        return hex.toUpperCase();
    }
  }

  function getContrastTextColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 152 ? '#0F172A' : '#FFFFFF';
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function savePalette() {
    localStorage.setItem('palette_gen_swatches', JSON.stringify(palette));
  }

  // --- UI List Rendering ---
  function renderPaletteList() {
    swatchCount.textContent = palette.length;
    paletteList.innerHTML = '';

    palette.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'swatch-item';
      li.innerHTML = `
        <div class="swatch-dot" style="background:${item.hex}"></div>
        <div class="swatch-meta">
          <div class="swatch-top">
            <span class="swatch-name">${escapeHtml(item.name)}</span>
            <span class="swatch-role">${escapeHtml(item.label)}</span>
          </div>
          <div class="swatch-code">${formatColorCode(item.hex, displayFormat)}</div>
        </div>
        <div class="swatch-actions">
          <button type="button" class="icon-btn" data-action="up" data-idx="${index}" title="Move Up" ${index === 0 ? 'disabled' : ''}>&#8593;</button>
          <button type="button" class="icon-btn" data-action="down" data-idx="${index}" title="Move Down" ${index === palette.length - 1 ? 'disabled' : ''}>&#8595;</button>
          <button type="button" class="icon-btn delete" data-action="delete" data-idx="${index}" title="Remove Color">&times;</button>
        </div>
      `;
      paletteList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // --- Canvas Artwork Renderer (Multiple Designs) ---
  function drawRoundedRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function renderCanvas() {
    const W = canvasDimensions.width;
    const H = canvasDimensions.height;
    paletteCanvas.width = W;
    paletteCanvas.height = H;

    const brandTitle = brandTitleInput.value.trim() || 'Brand Color Palette';
    const items = palette.length ? palette : [{ hex: '#2563EB', name: 'Cobalt Blue', label: 'Primary' }];

    // Background Card Surface
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const pad = Math.round(W * 0.045);
    const headerH = Math.round(H * 0.13);

    // Header Title & Metadata (Syne Font)
    ctx.fillStyle = '#0F172A';
    ctx.font = `800 ${Math.round(W * 0.026)}px "Syne", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(brandTitle, pad, pad + headerH * 0.28);

    ctx.fillStyle = '#64748B';
    ctx.font = `600 ${Math.round(W * 0.012)}px "Syne", sans-serif`;
    const designLabelMap = {
      'horizontal-lines': 'HORIZONTAL BANDS',
      'vertical-stripes': 'VERTICAL PILLARS',
      'swiss-grid': 'SWISS SPEC CARDS',
      'gradient-waves': 'LAYERED WAVES',
      'editorial-circles': 'CHROMATIC ORBS'
    };
    ctx.fillText(
      `${items.length} BRAND COLORS  •  ${designLabelMap[currentDesign]}  •  FORMAT: ${displayFormat}`,
      pad,
      pad + headerH * 0.68
    );

    // Subtle divider line
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, pad + headerH);
    ctx.lineTo(W - pad, pad + headerH);
    ctx.stroke();

    const bodyTop = pad + headerH + Math.round(H * 0.035);
    const bodyH = H - bodyTop - pad;
    const bodyW = W - pad * 2;

    if (currentDesign === 'horizontal-lines') {
      renderHorizontalLines(items, pad, bodyTop, bodyW, bodyH);
    } else if (currentDesign === 'vertical-stripes') {
      renderVerticalStripes(items, pad, bodyTop, bodyW, bodyH);
    } else if (currentDesign === 'swiss-grid') {
      renderSwissGrid(items, pad, bodyTop, bodyW, bodyH);
    } else if (currentDesign === 'gradient-waves') {
      renderLayeredWaves(items, pad, bodyTop, bodyW, bodyH);
    } else if (currentDesign === 'editorial-circles') {
      renderEditorialCircles(items, pad, bodyTop, bodyW, bodyH);
    }

    exportMetaText.textContent = `Ready to export • ${W} × ${H} px • ${exportFormat.toUpperCase()}`;
  }

  // Design 1: Horizontal Lines / Bands
  function renderHorizontalLines(items, x, y, w, h) {
    const gap = Math.min(16, Math.floor(h * 0.025));
    const bandH = (h - gap * (items.length - 1)) / items.length;
    const radius = Math.min(20, bandH * 0.25);

    items.forEach((item, i) => {
      const by = y + i * (bandH + gap);
      const fg = getContrastTextColor(item.hex);

      drawRoundedRect(ctx, x, by, w, bandH, radius);
      ctx.fillStyle = item.hex;
      ctx.fill();

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const innerPad = Math.round(w * 0.028);
      const midY = by + bandH / 2;

      // Role Pill Badge on Left
      ctx.font = `700 ${Math.max(12, Math.min(17, bandH * 0.18))}px "Syne", sans-serif`;
      const roleText = item.label.toUpperCase();
      const roleMetrics = ctx.measureText(roleText);
      const pillW = roleMetrics.width + 24;
      const pillH = Math.max(24, Math.min(34, bandH * 0.34));

      drawRoundedRect(ctx, x + innerPad, midY - pillH / 2, pillW, pillH, pillH / 2);
      ctx.fillStyle = fg === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.09)';
      ctx.fill();

      ctx.fillStyle = fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(roleText, x + innerPad + 12, midY);

      // Color Name
      const nameX = x + innerPad + pillW + 20;
      ctx.font = `700 ${Math.max(15, Math.min(25, bandH * 0.27))}px "Syne", sans-serif`;
      ctx.fillText(item.name, nameX, midY);

      // Formatted Color Code on Right
      const codeStr = formatColorCode(item.hex, displayFormat);
      ctx.font = `600 ${Math.max(13, Math.min(20, bandH * 0.21))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(codeStr, x + w - innerPad, midY);
      ctx.textAlign = 'left';
    });
  }

  // Design 2: Vertical Stripes / Architectural Columns
  function renderVerticalStripes(items, x, y, w, h) {
    const gap = Math.min(18, Math.floor(w * 0.016));
    const colW = (w - gap * (items.length - 1)) / items.length;
    const radius = 18;

    items.forEach((item, i) => {
      const cx = x + i * (colW + gap);
      const fg = getContrastTextColor(item.hex);

      drawRoundedRect(ctx, cx, y, colW, h, radius);
      ctx.fillStyle = item.hex;
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const footerH = Math.min(175, h * 0.32);
      const fy = y + h - footerH;
      ctx.save();
      drawRoundedRect(ctx, cx, y, colW, h, radius);
      ctx.clip();
      ctx.fillStyle = fg === '#FFFFFF' ? 'rgba(15, 23, 42, 0.28)' : 'rgba(255, 255, 255, 0.65)';
      ctx.fillRect(cx, fy, colW, footerH);
      ctx.restore();

      const padIn = Math.min(20, colW * 0.1);
      ctx.fillStyle = fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.font = `700 ${Math.max(11, Math.min(13, colW * 0.06))}px "Syne", sans-serif`;
      ctx.fillText(item.label.toUpperCase(), cx + padIn, fy + 18);

      ctx.font = `800 ${Math.max(15, Math.min(21, colW * 0.09))}px "Syne", sans-serif`;
      ctx.fillText(item.name, cx + padIn, fy + 44, colW - padIn * 2);

      ctx.font = `500 ${Math.max(11, Math.min(15, colW * 0.068))}px "JetBrains Mono", monospace`;
      const codeStr = formatColorCode(item.hex, displayFormat);
      ctx.fillText(codeStr, cx + padIn, fy + 82, colW - padIn * 2);
    });
  }

  // Design 3: Swiss Spec Cards Grid
  function renderSwissGrid(items, x, y, w, h) {
    const cols = items.length <= 3 ? items.length : Math.min(4, Math.ceil(items.length / 2));
    const rows = Math.ceil(items.length / cols);
    const gap = 22;
    const cardW = (w - gap * (cols - 1)) / cols;
    const cardH = (h - gap * (rows - 1)) / rows;

    items.forEach((item, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = x + c * (cardW + gap);
      const cy = y + r * (cardH + gap);

      drawRoundedRect(ctx, cx, cy, cardW, cardH, 18);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.stroke();

      const swatchH = cardH * 0.58;
      ctx.save();
      drawRoundedRect(ctx, cx, cy, cardW, cardH, 18);
      ctx.clip();
      ctx.fillStyle = item.hex;
      ctx.fillRect(cx, cy, cardW, swatchH);
      ctx.restore();

      const fg = getContrastTextColor(item.hex);
      ctx.font = '700 12px "Syne", sans-serif';
      const roleTxt = item.label.toUpperCase();
      const badgeW = ctx.measureText(roleTxt).width + 20;
      drawRoundedRect(ctx, cx + 16, cy + 16, badgeW, 28, 14);
      ctx.fillStyle = fg === '#FFFFFF' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.75)';
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textBaseline = 'middle';
      ctx.fillText(roleTxt, cx + 26, cy + 30);

      const metaY = cy + swatchH + 22;
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 20px "Syne", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(item.name, cx + 18, metaY, cardW - 36);

      ctx.fillStyle = '#475569';
      ctx.font = '500 14px "JetBrains Mono", monospace';
      ctx.fillText(formatColorCode(item.hex, displayFormat), cx + 18, metaY + 34, cardW - 36);
    });
  }

  // Design 4: Layered Waves + Spec Legend
  function renderLayeredWaves(items, x, y, w, h) {
    const artW = w * 0.56;
    const legendX = x + artW + 32;
    const legendW = w - artW - 32;

    ctx.save();
    drawRoundedRect(ctx, x, y, artW, h, 24);
    ctx.clip();

    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(x, y, artW, h);

    const stepH = h / items.length;
    items.forEach((item, i) => {
      const baseY = y + i * stepH;
      ctx.beginPath();
      ctx.moveTo(x, baseY - 24);
      ctx.bezierCurveTo(
        x + artW * 0.35, baseY + 38,
        x + artW * 0.65, baseY - 52,
        x + artW, baseY + 14
      );
      ctx.lineTo(x + artW, y + h + 40);
      ctx.lineTo(x, y + h + 40);
      ctx.closePath();
      ctx.fillStyle = item.hex;
      ctx.fill();
    });
    ctx.restore();

    const rowH = Math.min(115, (h - (items.length - 1) * 14) / items.length);
    items.forEach((item, i) => {
      const ry = y + i * (rowH + 14);
      drawRoundedRect(ctx, legendX, ry, legendW, rowH, 14);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const chipSize = Math.min(54, rowH - 24);
      drawRoundedRect(ctx, legendX + 16, ry + (rowH - chipSize) / 2, chipSize, chipSize, 12);
      ctx.fillStyle = item.hex;
      ctx.fill();

      const tx = legendX + 16 + chipSize + 16;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#2563EB';
      ctx.font = '700 12px "Syne", sans-serif';
      ctx.fillText(item.label.toUpperCase(), tx, ry + 14);

      ctx.fillStyle = '#0F172A';
      ctx.font = '700 18px "Syne", sans-serif';
      ctx.fillText(item.name, tx, ry + 32, legendW - chipSize - 48);

      ctx.fillStyle = '#475569';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillText(formatColorCode(item.hex, displayFormat), tx, ry + 58, legendW - chipSize - 48);
    });
  }

  // Design 5: Chromatic Orbs & Typography Table
  function renderEditorialCircles(items, x, y, w, h) {
    const circleAreaH = h * 0.48;
    const maxR = Math.min((w / items.length) * 0.42, circleAreaH * 0.42);
    const spacing = w / items.length;

    items.forEach((item, i) => {
      const cx = x + spacing * i + spacing / 2;
      const cy = y + circleAreaH / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, maxR + 10, 0, Math.PI * 2);
      ctx.strokeStyle = item.hex;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fillStyle = item.hex;
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const fg = getContrastTextColor(item.hex);
      ctx.fillStyle = fg;
      ctx.font = '700 12px "Syne", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label.toUpperCase(), cx, cy);
    });

    const tableY = y + circleAreaH + 20;
    const tableH = h - circleAreaH - 20;
    const rowH = tableH / items.length;
    ctx.textAlign = 'left';

    items.forEach((item, i) => {
      const ry = tableY + i * rowH;
      if (i > 0) {
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, ry);
        ctx.lineTo(x + w, ry);
        ctx.stroke();
      }

      const midY = ry + rowH / 2;
      ctx.beginPath();
      ctx.arc(x + 18, midY, 12, 0, Math.PI * 2);
      ctx.fillStyle = item.hex;
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.font = '700 17px "Syne", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.name, x + 46, midY);

      ctx.fillStyle = '#2563EB';
      ctx.font = '700 13px "Syne", sans-serif';
      ctx.fillText(item.label.toUpperCase(), x + w * 0.36, midY);

      ctx.fillStyle = '#334155';
      ctx.font = '500 15px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatColorCode(item.hex, displayFormat), x + w - 12, midY);
      ctx.textAlign = 'left';
    });
  }

  // --- Vector SVG Generator for Scalable Exports ---
  function generateSvgString() {
    const W = canvasDimensions.width;
    const H = canvasDimensions.height;
    const brandTitle = escapeHtml(brandTitleInput.value.trim() || 'Brand Color Palette');
    const items = palette.length ? palette : [{ hex: '#2563EB', name: 'Cobalt Blue', label: 'Primary' }];
    const pad = Math.round(W * 0.045);
    const headerH = Math.round(H * 0.13);
    const bodyTop = pad + headerH + Math.round(H * 0.035);
    const bodyH = H - bodyTop - pad;
    const bodyW = W - pad * 2;

    let shapesSvg = '';
    const gap = Math.min(16, Math.floor(bodyH * 0.025));
    const bandH = (bodyH - gap * (items.length - 1)) / items.length;

    items.forEach((item, i) => {
      const by = bodyTop + i * (bandH + gap);
      const fg = getContrastTextColor(item.hex);
      const codeStr = escapeHtml(formatColorCode(item.hex, displayFormat));
      shapesSvg += `
        <rect x="${pad}" y="${by}" width="${bodyW}" height="${bandH}" rx="18" fill="${item.hex}" stroke="rgba(15,23,42,0.12)" stroke-width="1.5"/>
        <text x="${pad + 36}" y="${by + bandH / 2}" fill="${fg}" font-family="Syne, sans-serif" font-weight="700" font-size="16" dominant-baseline="middle">[${escapeHtml(item.label.toUpperCase())}]  ${escapeHtml(item.name)}</text>
        <text x="${pad + bodyW - 36}" y="${by + bandH / 2}" fill="${fg}" font-family="monospace" font-weight="600" font-size="16" text-anchor="end" dominant-baseline="middle">${codeStr}</text>
      `;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  <text x="${pad}" y="${pad + headerH * 0.35}" font-family="Syne, sans-serif" font-weight="800" font-size="${Math.round(W * 0.026)}" fill="#0F172A">${brandTitle}</text>
  <text x="${pad}" y="${pad + headerH * 0.72}" font-family="Syne, sans-serif" font-weight="600" font-size="${Math.round(W * 0.012)}" fill="#64748B">${items.length} BRAND COLORS • FORMAT: ${displayFormat}</text>
  <line x1="${pad}" y1="${pad + headerH}" x2="${W - pad}" y2="${pad + headerH}" stroke="#E2E8F0" stroke-width="2"/>
  ${shapesSvg}
</svg>`;
  }

  // --- Event Listeners ---
  nativeColorPicker.addEventListener('input', (e) => {
    const hex = e.target.value.toUpperCase();
    colorCodeInput.value = hex;
    const suggested = suggestColorName(hex);
    colorNameInput.value = suggested;
    formatDetectedHint.textContent = `Detected: HEX • Auto-named: ${suggested}`;
  });

  colorCodeInput.addEventListener('input', () => {
    const parsed = parseAnyColor(colorCodeInput.value);
    if (parsed) {
      nativeColorPicker.value = parsed.hex;
      const suggested = suggestColorName(parsed.hex);
      formatDetectedHint.textContent = `Detected: ${parsed.format} (${parsed.hex}) • Suggested: ${suggested}`;
      if (!colorNameInput.dataset.userEdited) {
        colorNameInput.value = suggested;
      }
    } else {
      formatDetectedHint.textContent = 'Enter valid HEX (#2563EB), RGB(r,g,b), HSL(h,s%,l%), or CMYK(c,m,y,k)';
    }
  });

  colorNameInput.addEventListener('input', () => {
    colorNameInput.dataset.userEdited = 'true';
  });

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      colorLabelInput.value = btn.dataset.label;
    });
  });

  addColorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const parsed = parseAnyColor(colorCodeInput.value);
    if (!parsed) {
      showToast('Please enter a valid HEX, RGB, HSL, or CMYK color code.');
      colorCodeInput.focus();
      return;
    }

    const name = colorNameInput.value.trim() || suggestColorName(parsed.hex);
    const label = colorLabelInput.value.trim() || 'Brand Swatch';

    palette.push({
      id: 'c_' + Date.now(),
      hex: parsed.hex,
      name,
      label
    });

    delete colorNameInput.dataset.userEdited;
    savePalette();
    renderPaletteList();
    renderCanvas();
    showToast(`Added "${name}" (${parsed.hex})`);
  });

  paletteList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    const action = btn.dataset.action;

    if (action === 'delete') {
      palette.splice(idx, 1);
    } else if (action === 'up' && idx > 0) {
      [palette[idx - 1], palette[idx]] = [palette[idx], palette[idx - 1]];
    } else if (action === 'down' && idx < palette.length - 1) {
      [palette[idx + 1], palette[idx]] = [palette[idx], palette[idx + 1]];
    }

    savePalette();
    renderPaletteList();
    renderCanvas();
  });

  designStyleGroup.addEventListener('click', (e) => {
    const pill = e.target.closest('.design-pill');
    if (!pill) return;
    document.querySelectorAll('.design-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentDesign = pill.dataset.design;
    renderCanvas();
  });

  displayFormatSelect.addEventListener('change', (e) => {
    displayFormat = e.target.value;
    renderPaletteList();
    renderCanvas();
  });

  exportFormatSelect.addEventListener('change', (e) => {
    exportFormat = e.target.value;
    renderCanvas();
  });

  aspectRatioSelect.addEventListener('change', (e) => {
    const [w, h] = e.target.value.split('x').map(Number);
    canvasDimensions = { width: w, height: h };
    renderCanvas();
  });

  brandTitleInput.addEventListener('input', renderCanvas);

  loadPresetBtn.addEventListener('click', () => {
    palette = [...DEFAULT_PALETTE];
    savePalette();
    renderPaletteList();
    renderCanvas();
    showToast('Restored default brand palette');
  });

  clearAllBtn.addEventListener('click', () => {
    palette = [];
    savePalette();
    renderPaletteList();
    renderCanvas();
    showToast('Cleared all swatches');
  });

  themeToggleBtn.addEventListener('click', () => {
    isDark = !isDark;
    document.body.classList.toggle('dark-theme', isDark);
    document.getElementById('themeIconSun').classList.toggle('hidden', isDark);
    document.getElementById('themeIconMoon').classList.toggle('hidden', !isDark);
    document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
  });

  copyCssBtn.addEventListener('click', () => {
    const lines = [':root {'];
    palette.forEach((item, idx) => {
      const slug = item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `color-${idx + 1}`;
      lines.push(`  --brand-${slug}-${idx + 1}: ${item.hex}; /* ${item.name} */`);
    });
    lines.push('}');
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showToast('Copied CSS custom properties to clipboard!');
    });
  });

  downloadBtn.addEventListener('click', () => {
    const slug = (brandTitleInput.value.trim() || 'brand-palette')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const filename = `${slug}-${currentDesign}.${exportFormat}`;

    if (exportFormat === 'svg') {
      const svgContent = generateSvgString();
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      triggerDownload(URL.createObjectURL(blob), filename);
      showToast(`Exported ${filename}`);
      return;
    }

    const mimeMap = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp'
    };
    const mime = mimeMap[exportFormat] || 'image/png';
    const dataUrl = paletteCanvas.toDataURL(mime, 0.96);
    triggerDownload(dataUrl, filename);
    showToast(`Downloaded ${filename}`);
  });

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  renderPaletteList();
  renderCanvas();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(renderCanvas);
  }
})();
