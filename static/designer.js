/* DocuAI Designer — free-form, Canva-style page editor.
   Page units are PDF points (612 x 792) so the editor maps 1:1 to PDF export. */
(function () {
  let PW = 612, PH = 792;
  const MX = 54;
  // Paper sizes in PDF points. Keep in step with page_sizes.py (used by the PDF / Word export).
  const PAPERS = {
    letter: [612, 792, 'Letter \u00B7 Short bond (8.5 \u00D7 11 in)'],
    a4: [595.28, 841.89, 'A4 (210 \u00D7 297 mm)'],
    long: [612, 936, 'Long bond \u00B7 Folio (8.5 \u00D7 13 in)'],
    legal: [612, 1008, 'Legal (8.5 \u00D7 14 in)'],
    a5: [419.53, 595.28, 'A5 (148 \u00D7 210 mm)'],
  };
  // every design carries its own page size (pw x ph); older designs are Letter
  function useDims(d) { PW = (d && d.pw) || 612; PH = (d && d.ph) || 792; }
  function withDims(d, fn) { const a = PW, b = PH; useDims(d); try { return fn(); } finally { PW = a; PH = b; } }
  const FONTS = [
    ['Georgia, serif', 'Georgia'], ['\'Times New Roman\', Times, serif', 'Times New Roman'], ['Garamond, Georgia, serif', 'Garamond'],
    ['\'Palatino Linotype\', Palatino, serif', 'Palatino'], ['Cambria, Georgia, serif', 'Cambria'], ['\'Book Antiqua\', Palatino, serif', 'Book Antiqua'],
    ['Arial, Helvetica, sans-serif', 'Arial'], ['Calibri, Arial, sans-serif', 'Calibri'], ['Verdana, sans-serif', 'Verdana'],
    ['Tahoma, sans-serif', 'Tahoma'], ['\'Trebuchet MS\', sans-serif', 'Trebuchet MS'], ['\'Century Gothic\', Arial, sans-serif', 'Century Gothic'],
    ['\'Segoe UI\', Arial, sans-serif', 'Segoe UI'], ['\'Courier New\', monospace', 'Courier New'],
  ];
  const HEADING_RE = /^[A-Z][A-Z0-9 &/.\-]{2,}$/;
  const GAP = 28;
  const SINGLE = { grid: false, cols: 1, rows: 1, pages: 1 };
  const D = { wide: false, zoom: 'page', lay: SINGLE, sel: null, undo: [], redo: [], editing: false, full: false, scale: 1, guides: [], root: null, interactive: true };
  let uid = 0;
  const nid = () => 'e' + Date.now().toString(36) + (uid++);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const r1 = (n) => Math.round(n * 10) / 10;
  const escH = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ------------------------------------------------------------ build ---
  function txt(role, o) {
    return Object.assign({ id: nid(), kind: 'text', role, x: MX, y: 0, w: PW - MX * 2, text: '', font: 'Arial, sans-serif', size: 10.5, color: '#000', bold: false, italic: false, underline: false, align: 'left', lh: 1.4, caps: false, bg: '', pad: 0, bbw: 0, bbc: '', h: 0 }, o);
  }
  function box(o) {
    return Object.assign({ id: nid(), kind: 'rect', role: 'decor', x: 0, y: 0, w: 100, h: 1, bg: '', bc: '', bw: 0 }, o);
  }
  function parseContent(content) {
    const out = []; let buf = [];
    const flush = () => { if (buf.length) { out.push({ role: 'body', text: buf.join('\n') }); buf = []; } };
    String(content || '').split('\n').forEach((line) => {
      if (!line.trim()) { flush(); return; }
      if (HEADING_RE.test(line.trim())) { flush(); out.push({ role: 'heading', text: line.trim() }); } else buf.push(line);
    });
    flush();
    return out;
  }
  function styleFor(cfg, role) {
    const bs = cfg.bodySize || 10.5;
    if (role === 'heading') {
      const o = { font: cfg.font, size: r1(bs + 2), color: cfg.primary, bold: true, caps: true, lh: 1.3 };
      if (cfg.headStyle === 'rule') { o.bbw = 0.7; o.bbc = cfg.accent; o.pad = 2; }
      if (cfg.headStyle === 'underline') { o.underline = true; }
      return o;
    }
    return { font: cfg.font, size: bs, color: cfg.text, lh: 1.45 };
  }
  function flowEl(item, cfg, x, w, tpl) {
    return txt(item.role, Object.assign(styleFor(cfg, item.role), tpl || {}, { text: item.text, x, w, flow: true }));
  }

  function buildDesign(cfg, info, docType, content, typeLabel) {
    const pk = PAPERS[info && info.paperSize] ? info.paperSize : 'letter';
    useDims({ pw: PAPERS[pk][0], ph: PAPERS[pk][1] });
    const lay = cfg.layout || 'left', ns = cfg.nameSize || 22;
    const name = (info.name || '').trim() || 'Document';
    const contact = [info.phone, info.email, info.location].map((v) => (v || '').trim()).filter(Boolean).join(' \u00B7 ') || 'Contact information not provided';
    const centered = ['center', 'double', 'letterhead', 'legal', 'certificate', 'frame'].includes(lay);
    const els = [];
    let L = MX, W = PW - MX * 2, y = 50, bodyY = 140;
    const hasPhoto = Boolean(info.photoData) && !['minimal', 'letterhead', 'legal', 'certificate', 'editorial'].includes(lay);
    const head = (o) => txt('name', Object.assign({ font: cfg.font, size: ns, color: cfg.primary, bold: true, caps: cfg.caps, lh: 1.15, linked: true, text: name }, o));
    const kind = (o) => txt('type', Object.assign({ font: cfg.font, size: 10, color: cfg.accent, caps: true, lh: 1.2, linked: true, text: typeLabel }, o));
    const cont = (o) => txt('contact', Object.assign({ font: cfg.font, size: 9, color: cfg.muted, lh: 1.3, linked: true, text: contact }, o));
    const al = centered ? 'center' : 'left';
    if (lay === 'frame') { L = 70; W = PW - 140; }
    if (lay === 'bar') { L = 66; W = PW - 66 - MX; }
    const nameW = hasPhoto ? W - 76 : W;

    if (lay === 'band') {
      const bh = ns + 78;
      els.push(box({ x: 0, y: 0, w: PW, h: bh, bg: cfg.primary }));
      els.push(head({ x: L, y: 32, w: nameW, color: '#ffffff' }));
      els.push(kind({ x: L, y: 32 + ns + 6, w: W }));
      els.push(cont({ x: L, y: 32 + ns + 22, w: W, color: '#ffffff' }));
      bodyY = bh + 26;
    } else if (lay === 'split') {
      els.push(head({ x: L, y, w: W * 0.58 }));
      els.push(cont({ x: L + W * 0.6, y: y + 4, w: W * 0.4, size: 8.5, align: 'right' }));
      els.push(kind({ x: L, y: y + ns + 6, w: W * 0.58 }));
      els.push(box({ x: L, y: y + ns + 26, w: W, h: 1.2, bg: cfg.accent }));
      bodyY = y + ns + 48;
    } else if (lay === 'memo') {
      const bh = ns + 46;
      els.push(box({ x: L, y: y - 8, w: W, h: bh, bc: cfg.primary, bw: 1 }));
      els.push(box({ x: L, y: y - 8 + bh - 4, w: W, h: 4, bg: cfg.primary }));
      els.push(kind({ x: L + 12, y: y, w: W - 24, size: 13, bold: true, color: cfg.primary }));
      els.push(head({ x: L + 12, y: y + 20, w: W - 24, size: r1(ns * 0.75), bold: false, color: cfg.text }));
      els.push(cont({ x: L + 12, y: y + ns + 12, w: W - 24, size: 8.5 }));
      bodyY = y + bh + 14;
    } else if (lay === 'ruled') {
      els.push(box({ x: L, y: y - 6, w: W, h: 3, bg: cfg.primary }));
      els.push(head({ x: L, y: y + 6, w: nameW }));
      els.push(kind({ x: L, y: y + ns + 12, w: W }));
      els.push(cont({ x: L, y: y + ns + 28, w: W }));
      els.push(box({ x: L, y: y + ns + 46, w: W, h: 0.8, bg: cfg.accent }));
      bodyY = y + ns + 68;
    } else if (lay === 'double') {
      els.push(box({ x: L, y: y - 4, w: W, h: 1.2, bg: cfg.primary }));
      els.push(box({ x: L, y: y, w: W, h: 1.2, bg: cfg.primary }));
      els.push(head({ x: L, y: y + 12, w: W, align: 'center' }));
      els.push(kind({ x: L, y: y + ns + 18, w: W, align: 'center' }));
      els.push(cont({ x: L, y: y + ns + 34, w: W, align: 'center' }));
      els.push(box({ x: L, y: y + ns + 54, w: W, h: 1.2, bg: cfg.accent }));
      els.push(box({ x: L, y: y + ns + 58, w: W, h: 1.2, bg: cfg.accent }));
      bodyY = y + ns + 82;
    } else if (lay === 'editorial') {
      els.push(box({ x: L, y: y - 4, w: W, h: 6, bg: cfg.accent }));
      els.push(head({ x: L, y: y + 14, w: W, lh: 1.05 }));
      els.push(kind({ x: L, y: y + ns + 20, w: W, bold: true, size: 9 }));
      els.push(cont({ x: L, y: y + ns + 36, w: W }));
      bodyY = y + ns + 66;
    } else if (lay === 'minimal') {
      els.push(head({ x: L, y: y + 6, w: W, bold: false }));
      els.push(kind({ x: L, y: y + ns + 12, w: W, caps: false, color: cfg.muted }));
      els.push(cont({ x: L, y: y + ns + 28, w: W }));
      bodyY = y + ns + 68;
    } else if (lay === 'certificate') {
      els.push(box({ x: 28, y: 28, w: PW - 56, h: PH - 56, bc: cfg.accent, bw: 3 }));
      els.push(box({ x: 37, y: 37, w: PW - 74, h: PH - 74, bc: cfg.accent, bw: 0.8 }));
      L = 70; W = PW - 140;
      els.push(kind({ x: L, y: 96, w: W, align: 'center', size: 12, bold: true }));
      els.push(head({ x: L, y: 122, w: W, align: 'center', bold: false, italic: true }));
      els.push(box({ x: PW / 2 - 70, y: 122 + ns + 16, w: 140, h: 1, bg: cfg.accent }));
      els.push(cont({ x: L, y: 122 + ns + 28, w: W, align: 'center' }));
      bodyY = 122 + ns + 66;
    } else if (lay === 'letterhead' || lay === 'legal') {
      els.push(head({ x: L, y: y, w: W, align: 'center' }));
      els.push(kind({ x: L, y: y + ns + 4, w: W, align: 'center', size: lay === 'legal' ? 10 : 8.5, color: lay === 'legal' ? cfg.text : cfg.accent }));
      els.push(cont({ x: L, y: y + ns + 20, w: W, align: 'center', size: 8.5 }));
      els.push(box({ x: L, y: y + ns + 38, w: W, h: lay === 'legal' ? 2.4 : 1.6, bg: cfg.primary }));
      bodyY = y + ns + 62;
    } else {
      // left, center, frame, bar
      if (lay === 'frame') {
        els.push(box({ x: 30, y: 30, w: PW - 60, h: PH - 60, bc: cfg.primary, bw: 1.8 }));
        els.push(box({ x: 37, y: 37, w: PW - 74, h: PH - 74, bc: cfg.accent, bw: 0.6 }));
      }
      if (lay === 'bar') els.push(box({ x: 36, y: 40, w: 5, h: PH - 80, bg: cfg.accent }));
      els.push(head({ x: L, y: y + 6, w: nameW, align: al }));
      els.push(kind({ x: L, y: y + ns + 12, w: W, align: al }));
      els.push(cont({ x: L, y: y + ns + 28, w: W, align: al }));
      if (lay === 'left') els.push(box({ x: L, y: y + ns + 46, w: W, h: 1, bg: cfg.accent }));
      if (lay === 'center' || lay === 'frame') els.push(box({ x: L + 40, y: y + ns + 46, w: W - 80, h: 0.9, bg: cfg.accent }));
      bodyY = y + ns + 66;
    }
    if (hasPhoto) els.push({ id: nid(), kind: 'image', role: 'photo', x: PW - MX - 64, y: 46, w: 64, h: 64, src: '' });
    const bodyX = L, bodyW = W;
    parseContent(content).forEach((it) => els.push(flowEl(it, cfg, bodyX, bodyW)));
    return { v: 1, paper: pk, pw: PW, ph: PH, bg: cfg.background || '#ffffff', bodyY, bodyX, bodyW, els, hash: hashStr(content), tpl: cfg.id };
  }
  function hashStr(s) { s = String(s || ''); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; }

  // ------------------------------------------------------- content sync ---
  function rebuildContent(design) {
    const items = design.els.filter((e) => e.kind === 'text' && (e.role === 'heading' || e.role === 'body'))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
    let out = '', prev = null;
    items.forEach((e) => {
      const t = String(e.text || '').replace(/\s+$/g, '');
      if (!t) return;
      if (prev) out += (prev.role === 'heading' && e.role === 'body') ? '\n' : '\n\n';
      out += t; prev = e;
    });
    return out;
  }
  function syncFromContent(design, content, cfg) {
    useDims(design);
    // chat text changed: rebuild heading/body elements keeping their styling
    const old = design.els.filter((e) => e.role === 'heading' || e.role === 'body');
    const h0 = old.find((e) => e.role === 'heading'), b0 = old.find((e) => e.role === 'body');
    const pick = (e, role) => {
      if (!e) return null;
      const { font, size, color, bold, italic, underline, align, lh, caps, bbw, bbc, pad, bg } = e;
      return { font, size, color, bold, italic, underline, align, lh, caps, bbw, bbc, pad, bg };
    };
    const hs = pick(h0), bs = pick(b0);
    const x = (b0 || h0 || { x: design.bodyX || MX }).x, w = (b0 || h0 || { w: design.bodyW || PW - MX * 2 }).w;
    const startY = old.length ? Math.min.apply(null, old.map((e) => e.y)) : design.bodyY;
    design.els = design.els.filter((e) => e.role !== 'heading' && e.role !== 'body');
    parseContent(content).forEach((it) => {
      const e = flowEl(it, cfg, x, w, it.role === 'heading' ? hs : bs);
      design.els.push(e);
    });
    design.bodyY = startY;
    design.hash = hashStr(content);
  }

  // ------------------------------------------------------------- render ---
  function pageCount(design) {
    useDims(design);
    const bottom = Math.max.apply(null, [PH].concat(design.els.map((e) => e.y + (e.h || 0) + 24)));
    return Math.max(1, Math.ceil(bottom / PH));
  }
  // ---- layout: continuous (one tall page) or, in full screen, pages side by side in a grid ----
  function chooseLay(design) {
    useDims(design);
    const pages = pageCount(design);
    const flat = Object.assign({}, SINGLE, { rows: pages, pages });
    if (!D.root || D.wide || D.zoom !== 'page' || !D.full) return flat;
    const vp = D.root.querySelector('.dz-viewport'); if (!vp) return flat;
    const mobile = !(D.full || D.wide) && window.innerWidth <= 480;
    const cs = getComputedStyle(vp);
    const ah = vp.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (ah < 80 || mobile) return flat;
    // full screen: use the whole viewport width. side panel: the panel may grow up to half the window.
    const maxW = vp.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (maxW < 80) return flat;
    let best = null;
    for (let cols = 1; cols <= pages; cols++) {
      const rows = Math.ceil(pages / cols);
      const w = cols * PW + (cols - 1) * GAP, h = rows * PH + (rows - 1) * GAP;
      const s = Math.min(maxW / w, ah / h);
      if (!best || s > best.s * 1.03) best = { cols, rows, s, w };
    }
    const lay = best.cols === 1 ? flat : { grid: true, cols: best.cols, rows: best.rows, pages };
    lay.s = best.s; lay.pw = Math.ceil(best.w * best.s); lay.maxW = maxW;
    return lay;
  }
  // side panel hugs the document so the page fills its container (no empty backdrop)
  function sizePanel(lay) {
    const panel = D.root && D.root.closest('.workplace'); if (!panel) return;
    // keep the live preview at its default size; the document scales to fit it
    if (panel.style.width || panel.style.minWidth) { panel.style.width = ''; panel.style.minWidth = ''; }
  }
  function sameLay(a, b) { return a.grid === b.grid && a.cols === b.cols && a.rows === b.rows && a.pages === b.pages; }
  function layDims(lay, pages) {
    if (!lay.grid) return { w: PW, h: pages * PH };
    return { w: lay.cols * PW + (lay.cols - 1) * GAP, h: lay.rows * PH + (lay.rows - 1) * GAP };
  }
  function toScreen(e, lay) {
    if (!lay || !lay.grid) return { x: e.x, y: e.y };
    const p = Math.max(0, Math.min(lay.pages - 1, Math.floor(e.y / PH)));
    return { x: e.x + (p % lay.cols) * (PW + GAP), y: e.y - p * PH + Math.floor(p / lay.cols) * (PH + GAP) };
  }
  function fromScreen(sx, sy, w, lay) {
    if (!lay || !lay.grid) return { x: sx, y: Math.max(0, sy) };
    const c = Math.max(0, Math.min(lay.cols - 1, Math.floor((sx + w / 2) / (PW + GAP))));
    const r = Math.max(0, Math.min(lay.rows - 1, Math.floor((sy + 8) / (PH + GAP))));
    const p = Math.min(lay.pages - 1, r * lay.cols + c);
    const cc = p % lay.cols, rr = Math.floor(p / lay.cols);
    return { x: sx - cc * (PW + GAP), y: Math.max(p * PH, sy - rr * (PH + GAP) + p * PH) };
  }
  function place(n, e) { const p = toScreen(e, D.lay); n.style.left = r1(p.x) + 'px'; n.style.top = r1(p.y) + 'px'; }

  function elStyle(e, lay) {
    const sp = toScreen(e, lay);
    let s = `left:${r1(sp.x)}px;top:${r1(sp.y)}px;width:${e.w}px;`;
    if (e.kind === 'text') {
      s += `font-family:${e.font};font-size:${e.size}px;color:${e.color};font-weight:${e.bold ? 700 : 400};font-style:${e.italic ? 'italic' : 'normal'};`
        + `text-decoration:${e.underline ? 'underline' : 'none'};text-align:${e.align};line-height:${e.lh};text-transform:${e.caps ? 'uppercase' : 'none'};`
        + `padding:${e.pad || 0}px;${e.bg ? 'background:' + e.bg + ';' : ''}${e.bbw ? `border-bottom:${e.bbw}px solid ${e.bbc || '#000'};` : ''}`;
    } else {
      s += `height:${e.h}px;`;
      if (e.kind === 'rect') s += `${e.bg ? 'background:' + e.bg + ';' : ''}${e.bw ? `border:${e.bw}px solid ${e.bc || '#000'};` : ''}`;
    }
    return s;
  }
  function elHTML(e, info, interactive, lay) {
    const cls = `dz-el dz-${e.kind}`;
    if (e.kind === 'text') {
      return `<div class="${cls}" data-id="${e.id}" style="${elStyle(e, lay)}"><div class="dz-text" ${interactive ? '' : ''}>${escH(e.text)}</div></div>`;
    }
    if (e.kind === 'image') {
      const src = e.role === 'photo' ? (info.photoData || '') : (e.src || '');
      return `<div class="${cls}" data-id="${e.id}" style="${elStyle(e, lay)}">${src ? `<img src="${src}" alt="" draggable="false" />` : '<span class="dz-ph">Photo</span>'}</div>`;
    }
    return `<div class="${cls}" data-id="${e.id}" style="${elStyle(e, lay)}"></div>`;
  }
  function canvasHTML(design, info, interactive, lay) {
    useDims(design);
    lay = lay || SINGLE;
    const pages = pageCount(design);
    const els = design.els.map((e) => elHTML(e, info, interactive, lay)).join('');
    if (lay.grid) {
      const dm = layDims(lay, pages); let sheets = '';
      for (let p = 0; p < pages; p++) sheets += `<div class="dz-sheet" style="left:${(p % lay.cols) * (PW + GAP)}px;top:${Math.floor(p / lay.cols) * (PH + GAP)}px;width:${PW}px;height:${PH}px;background:${design.bg || '#fff'}"></div>`;
      return `<div class="dz-page dz-grid" style="width:${dm.w}px;height:${dm.h}px">${sheets}${els}<div class="dz-guides"></div></div>`;
    }
    let breaks = '';
    for (let i = 1; i < pages; i++) breaks += `<div class="dz-break" style="top:${i * PH}px"><span>Page ${i + 1}</span></div>`;
    return `<div class="dz-page" style="width:${PW}px;height:${pages * PH}px;background:${design.bg || '#fff'}">${els}${breaks}<div class="dz-guides"></div></div>`;
  }
  function fit(wrap, pageEl, design, local, clip) {
    useDims(design);
    const availW = wrap.clientWidth || PW;
    const lay = local ? SINGLE : D.lay;
    const dm = layDims(lay, pageCount(design));
    const totalW = dm.w, total = clip ? PH : dm.h;
    let s;
    if (local) s = Math.min(1.15, availW / totalW);
    else {
      // editor: scale the WHOLE document to fit the panel (width and height) so it never scrolls
      s = Math.min((D.full || D.wide) ? 4 : 2.2, availW / totalW);
      if (D.zoom !== 'page' && D.zoom !== 'width') s = Math.min(s, Number(D.zoom) || s);
      const vp = D.root && D.root.querySelector('.dz-viewport');
      // side panel: the page always fills the panel width and scrolls vertically; full screen keeps fit-page
      const fitPage = D.zoom === 'page' && (D.full || D.wide);
      if (vp) vp.style.overflowY = fitPage ? 'hidden' : 'auto';
      if (vp && fitPage) {
        const cs = getComputedStyle(vp);
        const availH = vp.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
        if (availH > 60) s = Math.min(s, availH / total);
      }
      D.scale = s;
    }
    pageEl.style.transform = `scale(${s})`;
    pageEl.style.left = Math.max(0, (availW - totalW * s) / 2) + 'px';
    wrap.style.height = Math.ceil(total * s) + 'px';
  }

  // static (read-only) render, used by the saved-document preview
  function renderStatic(container, design, info) { return withDims(design, () => renderStaticInner(container, design, info)); }
  function renderStaticInner(container, design, info) {
    container.classList.add('dz-static-wrap');
    container.innerHTML = `<div class="dz-scale">${canvasHTML(design, info || {}, false)}</div>`;
    const wrap = container.querySelector('.dz-scale');
    const page = wrap.querySelector('.dz-page');
    fit(wrap, page, design, true);
  }

  // live read-only mirror of the editor canvas (used in the chat message). Never touches editor state.
  function renderMirror(container, design, info) { return withDims(design, () => renderMirrorInner(container, design, info)); }
  function renderMirrorInner(container, design, info) {
    container.classList.add('dz-static-wrap');
    container.innerHTML = `<div class="dz-scale">${canvasHTML(design, info || {}, false)}</div>`;
    const wrap = container.querySelector('.dz-scale');
    const page = wrap.querySelector('.dz-page');
    fit(wrap, page, design, true, true);   // small thumbnail of page 1
  }
  function notify() { const c = ctx(); if (c && c.onChange) c.onChange(); }

  // -------------------------------------------------------- interactive ---
  function ctx() { return window.__designerCtx; }
  function snapshot() {
    const c = ctx(); if (!c || !c.getDesign()) return;
    D.undo.push(JSON.stringify(c.getDesign())); if (D.undo.length > 80) D.undo.shift(); D.redo = [];
  }
  function commit(opts) {
    const c = ctx(); const d = c.getDesign();
    if (opts && opts.reflow) reflow(d);
    const content = rebuildContent(d);
    d.hash = hashStr(content);
    c.setContent(content);
    c.markDirty();
    notify();
  }
  function measure(d) {
    const page = D.root && D.root.querySelector('.dz-page'); if (!page) return;
    d.els.forEach((e) => {
      if (e.kind !== 'text') return;
      const n = page.querySelector(`[data-id="${e.id}"]`);
      if (n) e.h = n.offsetHeight;
    });
  }
  function reflow(d) {
    measure(d);
    const flows = d.els.filter((e) => e.flow && e.kind === 'text');
    if (!flows.length) return;
    // keep the order the elements currently have on the page
    flows.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    let y = d.bodyY;
    flows.forEach((e) => {
      e.y = r1(y);
      y += (e.h || 14) + (e.role === 'heading' ? 5 : 13);
    });
  }
  function autoArrange(d) {
    d.els.forEach((e) => { if (e.role === 'heading' || e.role === 'body') e.flow = true; });
    measure(d);
    const flows = d.els.filter((e) => e.flow && e.kind === 'text');
    // preserve content order = current document order
    let y = d.bodyY;
    flows.forEach((e) => { e.y = r1(y); y += (e.h || 14) + (e.role === 'heading' ? 5 : 13); });
  }

  function selected() { const d = ctx().getDesign(); return d && d.els.find((e) => e.id === D.sel); }

  function bindCanvas(root) {
    const c = ctx(); const wrap = root.querySelector('.dz-scale'); const page = root.querySelector('.dz-page');
    const d = c.getDesign();
    fit(wrap, page, d);
    // text editing + selection
    page.querySelectorAll('.dz-el').forEach((n) => {
      const e = d.els.find((x) => x.id === n.dataset.id); if (!e) return;
      n.addEventListener('pointerdown', (ev) => onDown(ev, n, e));
      if (e.kind === 'text') {
        n.addEventListener('dblclick', () => startEdit(n, e));
      }
    });
    page.addEventListener('pointerdown', (ev) => { if (ev.target === page || ev.target.classList.contains('dz-break') || ev.target.classList.contains('dz-guides')) { select(null); } });
    if (D.sel) markSelected(page);
  }
  function select(id) {
    if (D.editing) endEdit();
    D.sel = id;
    const page = D.root.querySelector('.dz-page');
    markSelected(page);
    renderToolbar();
  }
  function markSelected(page) {
    page.querySelectorAll('.dz-el').forEach((n) => n.classList.toggle('dz-sel', n.dataset.id === D.sel));
    page.querySelectorAll('.dz-handle').forEach((h) => h.remove());
    const e = selected(); if (!e) return;
    const n = page.querySelector(`[data-id="${e.id}"]`); if (!n) return;
    const dirs = e.kind === 'text' ? ['w', 'e'] : (e.kind === 'image' ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    dirs.forEach((dir) => {
      const h = document.createElement('i'); h.className = 'dz-handle dz-h-' + dir; h.dataset.dir = dir;
      h.addEventListener('pointerdown', (ev) => onResizeDown(ev, n, e, dir));
      n.appendChild(h);
    });
  }

  function candidates(d, self) {
    const lay = D.lay;
    let xs = [0, MX, PW / 2, PW - MX, PW], ys = [MX, PH / 2];
    if (lay.grid) {
      xs = []; ys = [];
      for (let c = 0; c < lay.cols; c++) { const o = c * (PW + GAP); xs.push(o, o + MX, o + PW / 2, o + PW - MX, o + PW); }
      for (let r = 0; r < lay.rows; r++) { const o = r * (PH + GAP); ys.push(o + MX, o + PH / 2); }
    }
    d.els.forEach((o) => {
      if (o === self) return;
      const p = toScreen(o, lay);
      xs.push(p.x, p.x + o.w / 2, p.x + o.w);
      const h = o.h || 0; ys.push(p.y, p.y + h / 2, p.y + h);
    });
    return { xs, ys };
  }
  function snapAxis(vals, cand, thr) {
    // vals: [start, center, end] of the moving element; returns delta
    let best = null;
    vals.forEach((v) => cand.forEach((c) => { const dd = c - v; if (Math.abs(dd) <= thr && (best === null || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, at: c }; }));
    return best;
  }
  function drawGuides(gx, gy) {
    const g = D.root.querySelector('.dz-guides'); if (!g) return;
    const h = D.root.querySelector('.dz-page').offsetHeight;
    g.innerHTML = (gx !== null ? `<div class="dz-gv" style="left:${gx}px;height:${h}px"></div>` : '') + (gy !== null ? `<div class="dz-gh" style="top:${gy}px"></div>` : '');
  }

  function onDown(ev, n, e) {
    if (D.editing && D.editEl === e.id) return;            // let the caret work
    if (ev.target.classList.contains('dz-handle')) return;
    ev.preventDefault();
    if (D.editing) { endEdit(); n = D.root.querySelector(`[data-id="${e.id}"]`) || n; }
    if (D.sel !== e.id) select(e.id);
    n = D.root.querySelector(`[data-id="${e.id}"]`) || n;
    const d = ctx().getDesign();
    const sx = ev.clientX, sy = ev.clientY, s = D.scale || 1;
    const o0 = toScreen(e, D.lay), ox = o0.x, oy = o0.y;
    const h = e.h || n.offsetHeight; const cand = candidates(d, e);
    let moved = false;
    n.setPointerCapture(ev.pointerId);
    const move = (m) => {
      const dx = (m.clientX - sx) / s, dy = (m.clientY - sy) / s;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!moved) { snapshot(); moved = true; n.classList.add('dz-moving'); }
      let nx = ox + dx, ny = oy + dy;
      let gx = null, gy = null;
      if (!m.altKey) {
        const sxn = snapAxis([nx, nx + e.w / 2, nx + e.w], cand.xs, 5 / s);
        const syn = snapAxis([ny, ny + h / 2, ny + h], cand.ys, 5 / s);
        if (sxn) { nx += sxn.d; gx = sxn.at; } if (syn) { ny += syn.d; gy = syn.at; }
      }
      const dp = fromScreen(nx, ny, e.w, D.lay);
      e.x = r1(dp.x); e.y = r1(dp.y);
      place(n, e);
      drawGuides(gx, gy);
      notify();
    };
    const up = () => {
      n.removeEventListener('pointermove', move); n.removeEventListener('pointerup', up); n.removeEventListener('pointercancel', up);
      n.classList.remove('dz-moving'); drawGuides(null, null);
      if (moved) { e.flow = false; commit({}); fitHeight(); renderToolbar(); }
    };
    n.addEventListener('pointermove', move); n.addEventListener('pointerup', up); n.addEventListener('pointercancel', up);
  }
  function onResizeDown(ev, n, e, dir) {
    ev.preventDefault(); ev.stopPropagation();
    const sx = ev.clientX, sy = ev.clientY, s = D.scale || 1;
    const o = { x: e.x, y: e.y, w: e.w, h: e.h || n.offsetHeight };
    const ratio = o.w / (o.h || 1);
    let started = false;
    const handle = ev.target; handle.setPointerCapture(ev.pointerId);
    const move = (m) => {
      const dx = (m.clientX - sx) / s, dy = (m.clientY - sy) / s;
      if (!started) { if (Math.abs(dx) + Math.abs(dy) < 2) return; snapshot(); started = true; }
      let { x, y, w, h } = o;
      if (dir.includes('e')) w = o.w + dx;
      if (dir.includes('w')) { w = o.w - dx; x = o.x + dx; }
      if (dir.includes('s')) h = o.h + dy;
      if (dir.includes('n')) { h = o.h - dy; y = o.y + dy; }
      if (e.kind === 'image' || m.shiftKey) { // keep aspect
        const nh = w / ratio; if (dir.includes('n')) y = o.y + (o.h - nh); h = nh;
      }
      if (w < 12) { if (dir.includes('w')) x = o.x + o.w - 12; w = 12; }
      if (h < 1 && e.kind !== 'text') h = 1;
      e.x = r1(x); e.y = r1(y); e.w = r1(w);
      place(n, e); n.style.width = e.w + 'px';
      if (e.kind !== 'text') { e.h = r1(h); n.style.height = e.h + 'px'; }
      notify();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      if (started) { e.flow = e.flow && e.kind === 'text'; commit({ reflow: e.kind === 'text' && e.flow }); render(); }
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  }
  function fitHeight(noRelayout) {
    const page = D.root.querySelector('.dz-page'); const wrap = D.root.querySelector('.dz-scale');
    const d = ctx().getDesign();
    if (!noRelayout) { const lay = chooseLay(d); if (!sameLay(lay, D.lay)) { render(); return; } D.lay = lay; }
    sizePanel(D.lay);
    const dm = layDims(D.lay, pageCount(d));
    page.style.width = dm.w + 'px'; page.style.height = dm.h + 'px'; fit(wrap, page, d);
  }

  function startEdit(n, e) {
    if (D.editing) endEdit();
    select(e.id);
    const t = n.querySelector('.dz-text');
    D.editing = true; D.editEl = e.id; n.classList.add('dz-editing');
    t.contentEditable = 'plaintext-only';
    if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
    t.focus();
    const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
    let snap = false; const before = e.text;
    t.oninput = () => {
      if (!snap) { snapshotWith(before, e.id); snap = true; }
      e.text = t.innerText.replace(/\n$/, ''); e.linked = false;
      if (e.role === 'name') ctx().setName(e.text);
      if (e.role === 'contact' && ctx().setContact) ctx().setContact(e.text);
      e.h = n.offsetHeight;
      ctx().setContent(rebuildContent(ctx().getDesign())); ctx().markDirty(true); notify();
    };
    t.onkeydown = (k) => { if (k.key === 'Escape') { endEdit(); } k.stopPropagation(); };
    t.onblur = () => { setTimeout(() => { if (D.editing && D.editEl === e.id) endEdit(); }, 0); };
  }
  function snapshotWith(beforeText, id) {
    const d = ctx().getDesign(); const copy = clone(d); const e = copy.els.find((x) => x.id === id); if (e) e.text = beforeText;
    D.undo.push(JSON.stringify(copy)); if (D.undo.length > 80) D.undo.shift(); D.redo = [];
  }
  function endEdit() {
    if (!D.editing) return;
    const id = D.editEl; D.editing = false; D.editEl = null;
    const n = D.root && D.root.querySelector(`[data-id="${id}"]`);
    if (n) { const t = n.querySelector('.dz-text'); if (t) { t.contentEditable = 'false'; t.oninput = null; t.onblur = null; } n.classList.remove('dz-editing'); }
    const d = ctx().getDesign(); if (!d) return;
    const e = d.els.find((x) => x.id === id);
    if (e && e.flow) { commit({ reflow: true }); render(); } else { commit({}); }
  }

  // ------------------------------------------------------------ toolbar ---
  function ico(name) {
    const p = {
      undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
      front: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>', back: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M20 8v10a2 2 0 0 1-2 2H8"/>',
      expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
      left: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', center: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', right: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
      text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', box: '<rect x="4" y="5" width="16" height="14" rx="1"/>', line: '<path d="M4 12h16"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
      wand: '<path d="m15 4 5 5L8 21l-5-5zM14 5l5 5"/>',
    }[name] || '';
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }
  function renderToolbar() {
    const bar = D.root.querySelector('.dz-toolbar'); if (!bar) return;
    const sel = selected();
    const paperKey = PAPERS[(ctx().info() || {}).paperSize] ? ctx().info().paperSize : (ctx().getDesign().paper || 'letter');
    const e = sel || { kind: 'text', font: FONTS[0][0], size: 12, color: '#000000', lh: 1.3, bg: '', bold: false, italic: false, underline: false, caps: false, align: 'left' };
    const btn = (act, title, inner, on) => `<button type="button" class="dz-b ${on ? 'on' : ''}" data-dz="${act}" title="${title}" aria-label="${title}">${inner}</button>`;
    let h = `<div class="dz-row">`
      + btn('undo', 'Undo (Ctrl+Z)', ico('undo')) + btn('redo', 'Redo (Ctrl+Y)', ico('redo')) + '<span class="dz-sep"></span>'
      + btn('add-text', 'Add text', ico('text') + '<em>Text</em>') + btn('add-box', 'Add shape', ico('box') + '<em>Shape</em>') + btn('add-line', 'Add line', ico('line') + '<em>Line</em>')
      + btn('add-image', 'Add image', ico('image') + '<em>Image</em>') + '<span class="dz-sep"></span>'
      + btn('arrange', 'Auto-arrange text sections', ico('wand') + '<em>Arrange</em>')
      + `<label class="dz-color" title="Page color"><span>Page</span><input type="color" data-dz-page value="${toHex(ctx().getDesign().bg)}"></label>`
      + `<select class="dz-sel" data-dz-paper title="Paper size">${Object.entries(PAPERS).map(([k, v]) => `<option value="${k}" ${k === paperKey ? 'selected' : ''}>${escH(v[2])}</option>`).join('')}</select>`
      + ((D.full || D.wide) ? `<select class="dz-sel" data-dz-zoom title="Zoom">${[['page', 'Fit page'], ['width', 'Fit width'], ['1', '100%'], ['1.5', '150%']].map(([k, t]) => `<option value="${k}" ${String(D.zoom) === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : '')
      + '</div>';
    h += '<div class="dz-props-slot">';
    {
      h += '<div class="dz-row dz-props">';
      if (e.kind === 'text') {
        h += `<select data-dz-prop="font" title="Font">${FONTS.map((f) => `<option value="${escH(f[0])}" ${sameFont(f[0], e.font) ? 'selected' : ''}>${f[1]}</option>`).join('')}</select>`
          + `<button type="button" class="dz-b" data-dz="size-" title="Smaller">\u2212</button><input class="dz-num" type="number" min="5" max="120" step="0.5" data-dz-prop="size" value="${e.size}" title="Font size"><button type="button" class="dz-b" data-dz="size+" title="Larger">+</button>`
          + `<label class="dz-color" title="Text color"><span>A</span><input type="color" data-dz-prop="color" value="${toHex(e.color)}"></label>`
          + btn('bold', 'Bold', '<b>B</b>', e.bold) + btn('italic', 'Italic', '<i>I</i>', e.italic) + btn('underline', 'Underline', '<u>U</u>', e.underline) + btn('caps', 'Uppercase', 'Aa', e.caps)
          + btn('al-left', 'Align left', ico('left'), e.align === 'left') + btn('al-center', 'Align center', ico('center'), e.align === 'center') + btn('al-right', 'Align right', ico('right'), e.align === 'right')
          + `<label class="dz-color" title="Line spacing"><span>\u2195</span><input class="dz-num" type="number" min="0.8" max="3" step="0.1" data-dz-prop="lh" value="${e.lh}"></label>`
          + `<label class="dz-color" title="Background fill"><span>Fill</span><input type="color" data-dz-prop="bg" value="${toHex(e.bg || '#ffffff')}"></label>` + btn('nofill', 'Remove fill', '\u2715', false);
      } else if (e.kind === 'rect') {
        h += `<label class="dz-color" title="Fill color"><span>Fill</span><input type="color" data-dz-prop="bg" value="${toHex(e.bg || '#ffffff')}"></label>` + btn('nofill', 'No fill', '\u2715')
          + `<label class="dz-color" title="Border color"><span>Border</span><input type="color" data-dz-prop="bc" value="${toHex(e.bc || '#000000')}"></label>`
          + `<label class="dz-color" title="Border width"><span>px</span><input class="dz-num" type="number" min="0" max="20" step="0.5" data-dz-prop="bw" value="${e.bw || 0}"></label>`
          + `<label class="dz-color" title="Height"><span>H</span><input class="dz-num" type="number" min="1" max="800" step="1" data-dz-prop="h" value="${r1(e.h)}"></label>`;
      } else if (e.kind === 'image') {
        h += '<span class="dz-note">Drag corners to resize the picture</span>';
      }
      h += '<span class="dz-sep"></span>' + btn('dup', 'Duplicate', ico('copy')) + btn('front', 'Bring to front', ico('front')) + btn('back', 'Send to back', ico('back')) + btn('del', 'Delete (Del)', ico('trash'));
      h += '</div>';
    }
    h += '</div>';
    bar.innerHTML = h;
    if (!sel) bar.querySelectorAll('.dz-props button, .dz-props input, .dz-props select').forEach((x) => { x.disabled = true; });
    bar.querySelectorAll('[data-dz]').forEach((b) => b.onclick = () => action(b.dataset.dz));
    bar.querySelectorAll('[data-dz-prop]').forEach((i) => {
      const ev = i.tagName === 'SELECT' || i.type === 'color' ? 'input' : 'change';
      let snapped = false;
      i.addEventListener(ev, () => { if (!snapped) { snapshot(); snapped = true; } setProp(i.dataset.dzProp, i.type === 'number' ? parseFloat(i.value) : i.value, i.type === 'color'); });
      i.addEventListener('change', () => { snapped = false; if (i.type === 'color') render(); });
    });
    const ps = bar.querySelector('[data-dz-paper]'); if (ps) ps.onchange = () => ctx().setPaper(ps.value);
    const zs = bar.querySelector('[data-dz-zoom]'); if (zs) zs.onchange = () => ctx().setZoom(zs.value);
    const pg = bar.querySelector('[data-dz-page]');
    if (pg) { let sn = false; pg.addEventListener('input', () => { if (!sn) { snapshot(); sn = true; } ctx().getDesign().bg = pg.value; (D.lay.grid ? D.root.querySelectorAll('.dz-sheet') : [D.root.querySelector('.dz-page')]).forEach((x) => { x.style.background = pg.value; }); ctx().markDirty(); notify(); }); pg.addEventListener('change', () => { sn = false; }); }
  }
  function sameFont(a, b) { return String(a).split(',')[0].replace(/['"]/g, '').trim() === String(b).split(',')[0].replace(/['"]/g, '').trim(); }
  function toHex(c) {
    c = String(c || '#000000').trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('');
    return '#000000';
  }
  function setProp(k, v, noRender) {
    const e = selected(); if (!e) return;
    if (typeof v === 'number' && Number.isNaN(v)) return;
    e[k] = v;
    if (k === 'bbw' && v) e.bbc = e.bbc || e.color;
    ctx().markDirty();
    const n = D.root.querySelector(`[data-id="${e.id}"]`);
    if (n) { n.style.cssText = elStyle(e, D.lay); }
    const needsReflow = e.flow && ['font', 'size', 'lh', 'bold', 'italic', 'caps'].includes(k);
    if (needsReflow) { commit({ reflow: true }); render(); } else { commit({}); if (n) { if (!noRender) render(); else markSelected(D.root.querySelector('.dz-page')); } }
  }
  function action(a) {
    const c = ctx(); const d = c.getDesign(); const e = selected();
    if (a === 'undo' || a === 'redo') return undoRedo(a);
    if (a === 'full') { D.full = !D.full; c.setFull(D.full); return; }
    if (a === 'reset') {
      const doReset = () => { snapshot(); c.resetDesign(); };
      if (c.confirmAsk) c.confirmAsk({ title: 'Reset to the template layout?', text: 'Your custom changes to the layout will be lost.', cancelLabel: 'Keep my layout', confirmLabel: 'Reset layout', icon: 'layout', danger: true, onConfirm: doReset });
      else if (confirm('Reset to the template layout? Your custom changes will be lost.')) doReset();
      return;
    }
    if (a === 'arrange') { snapshot(); autoArrange(d); commit({}); render(); return; }
    if (a.startsWith('add-')) return addEl(a.slice(4));
    if (!e) return;
    snapshot();
    if (a === 'bold' || a === 'italic' || a === 'underline' || a === 'caps') { e[a] = !e[a]; commit({ reflow: e.flow }); render(); return; }
    if (a.startsWith('al-')) { e.align = a.slice(3); commit({}); render(); return; }
    if (a === 'size+' || a === 'size-') { e.size = Math.max(5, Math.min(120, r1(e.size + (a === 'size+' ? 1 : -1)))); commit({ reflow: e.flow }); render(); return; }
    if (a === 'nofill') { e.bg = ''; commit({}); render(); return; }
    if (a === 'del') { d.els = d.els.filter((x) => x.id !== e.id); D.sel = null; commit({}); render(); return; }
    if (a === 'dup') { const cp = clone(e); cp.id = nid(); cp.x += 14; cp.y += 14; cp.flow = false; if (cp.role === 'heading' || cp.role === 'body' || cp.role === 'name' || cp.role === 'photo') { cp.role = cp.kind === 'text' ? 'custom' : 'decor'; cp.linked = false; } d.els.push(cp); D.sel = cp.id; commit({}); render(); return; }
    if (a === 'front') { d.els = d.els.filter((x) => x !== e).concat([e]); commit({}); render(); return; }
    if (a === 'back') { d.els = [e].concat(d.els.filter((x) => x !== e)); commit({}); render(); return; }
  }
  function addEl(kind) {
    const c = ctx(); const d = c.getDesign(); const cfg = c.cfg();
    if (kind === 'image') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const im = new Image();
          im.onload = () => {
            let w = Math.min(200, im.width), h = w * im.height / im.width;
            // shrink big pictures so saved designs stay small
            const cv = document.createElement('canvas'); const k = Math.min(1, 900 / Math.max(im.width, im.height));
            cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
            cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
            snapshot();
            const el = { id: nid(), kind: 'image', role: 'custom', x: 100, y: 200, w, h, src: cv.toDataURL('image/jpeg', 0.85) };
            d.els.push(el); D.sel = el.id; c.markDirty(); render();
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(f);
      };
      inp.click(); return;
    }
    snapshot();
    const y = Math.max(60, Math.min(PH - 100, (D.root.querySelector('.dz-viewport') || { scrollTop: 0 }).scrollTop / D.scale + 120));
    let el;
    if (kind === 'text') el = txt('custom', { x: 120, y, w: 300, text: 'Double-click to edit', font: cfg.font, size: 14, color: cfg.text, h: 24 });
    else if (kind === 'box') el = box({ x: 120, y, w: 200, h: 80, bg: cfg.accent });
    else el = box({ x: MX, y, w: PW - MX * 2, h: 1.5, bg: cfg.primary });
    d.els.push(el); D.sel = el.id; c.markDirty(); render();
  }
  function undoRedo(which) {
    const c = ctx(); const from = which === 'undo' ? D.undo : D.redo, to = which === 'undo' ? D.redo : D.undo;
    if (!from.length) return;
    to.push(JSON.stringify(c.getDesign()));
    const prev = JSON.parse(from.pop());
    c.setDesign(prev);
    c.setContent(rebuildContent(prev)); c.markDirty();
    if (!prev.els.some((x) => x.id === D.sel)) D.sel = null;
    render();
  }

  function render() {
    const c = ctx(); const d = c.getDesign(); if (!D.root || !d) return;
    useDims(d);
    const vp = D.root.querySelector('.dz-viewport'); const st = vp ? vp.scrollTop : 0;
    const info = c.info();
    const wrap = D.root.querySelector('.dz-scale');
    D.lay = chooseLay(d);
    wrap.innerHTML = canvasHTML(d, info, true, D.lay);
    bindCanvas(D.root);
    // measure real heights, then place flowing text sections on first display
    if (d.needsFlow) { d.needsFlow = false; reflow(d); commit({}); D.lay = chooseLay(d); wrap.innerHTML = canvasHTML(d, info, true, D.lay); bindCanvas(D.root); }
    else { measure(d); const nl = chooseLay(d); if (!sameLay(nl, D.lay)) { D.lay = nl; wrap.innerHTML = canvasHTML(d, info, true, D.lay); bindCanvas(D.root); } }
    fitHeight(true);
    renderToolbar();
    if (vp) vp.scrollTop = st;
    notify();
  }

  function onKey(ev) {
    if (!D.root || !document.body.contains(D.root)) { document.removeEventListener('keydown', onKey); return; }
    if (D.editing) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable) return;
    const e = selected();
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undoRedo(ev.shiftKey ? 'redo' : 'undo'); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); undoRedo('redo'); return; }
    if (!e) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); action('del'); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); action('dup'); return; }
    if (ev.key === 'Enter' && e.kind === 'text') { ev.preventDefault(); const n = D.root.querySelector(`[data-id="${e.id}"]`); if (n) startEdit(n, e); return; }
    const step = ev.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
    if (mv) { ev.preventDefault(); snapshot(); e.x = r1(e.x + mv[0]); e.y = r1(Math.max(0, e.y + mv[1])); e.flow = false; commit({}); const n = D.root.querySelector(`[data-id="${e.id}"]`); if (n) place(n, e); notify(); }
  }

  // mount the editor into a container. `c` supplies state access.
  function mount(container, c) {
    window.__designerCtx = c;
    D.root = container;
    container.innerHTML = `<div class="dz-toolbar"></div><div class="dz-viewport"><div class="dz-scale"></div></div>`;
    document.removeEventListener('keydown', onKey); document.addEventListener('keydown', onKey);
    const vp = container.querySelector('.dz-viewport');
    if (window.ResizeObserver) {
      if (D.ro) D.ro.disconnect();
      let last = 0, lastH = 0;
      D.ro = new ResizeObserver(() => { const w = vp.clientWidth, h = vp.clientHeight; if (Math.abs(w - last) < 2 && Math.abs(h - lastH) < 2) return; last = w; lastH = h; const wrap = container.querySelector('.dz-scale'); const page = container.querySelector('.dz-page'); if (wrap && page && c.getDesign()) { fitHeight(); } });
      D.ro.observe(vp);
    }
    const d = c.getDesign(); if (d && d.needsFlow !== false && !d.flowed) { d.needsFlow = true; d.flowed = true; }
    render();
  }

  // switch the page size of an existing design: keeps margins, bars and frames, then re-flows the text
  function setPaper(design, key) {
    const p = PAPERS[key] || PAPERS.letter, ow = design.pw || 612, oh = design.ph || 792, nw = p[0], nh = p[1];
    design.paper = PAPERS[key] ? key : 'letter';
    if (Math.abs(ow - nw) < 0.5 && Math.abs(oh - nh) < 0.5) { design.pw = nw; design.ph = nh; return false; }
    const span = (x, w, o, n) => {                       // horizontal / vertical re-fit keeping the margins
      const l = x, r = o - (x + w);
      if (w > o * 0.5) return [l, Math.max(20, n - l - r)];
      if (Math.abs(l - r) < 2) return [(n - w) / 2, w];
      return [l <= r ? l : n - r - w, w];
    };
    design.els.forEach((e) => {
      if (e.kind === 'image') {
        const nx = span(e.x, e.w, ow, nw)[0];
        e.x = r1(Math.max(0, Math.min(nw - e.w, nx)));
      } else {
        const h = span(e.x, e.w, ow, nw); e.x = r1(h[0]); e.w = r1(h[1]);
        if (e.kind !== 'text' && e.h > oh * 0.6 && e.y < oh * 0.1) e.h = r1(Math.max(20, nh - e.y - (oh - (e.y + e.h))));
      }
    });
    if (design.bodyX != null && design.bodyW != null) { const b = span(design.bodyX, design.bodyW, ow, nw); design.bodyX = r1(b[0]); design.bodyW = r1(b[1]); }
    design.pw = nw; design.ph = nh; design.needsFlow = true;
    return true;
  }
  function setWide(on) { D.wide = !!on; D.zoom = 'page'; if (!on) { D.sel = null; D.editing = false; } }
  function setZoom(z) { D.zoom = z || 'page'; }

  window.Designer = { PAPERS, setPaper, setWide, setZoom, buildDesign, syncFromContent, rebuildContent, mount, renderStatic, renderMirror, pageCount: (d) => withDims(d, () => pageCount(d)), hashStr, render, resetHistory() { D.undo = []; D.redo = []; D.sel = null; D.editing = false; } };
})();
