/* ==========================================================
   Abis Invoice Generator - logika aplikasi
   Bagian:
     1. Utilitas & konstanta
     2. Penyimpanan (riwayat + nomor urut)
     3. Form & item (termasuk drag urutan)
     4. Pembuatan PDF
     5. Riwayat nota
     6. Event utama & inisialisasi
     7. Layout header (offset + header cadangan)
   Asset PDF (font & template) ada di assets/pdf-assets.js
   ========================================================== */
(function () {
  'use strict';

  /* ---------- 1. Utilitas & konstanta ---------- */
  const { FONTS, BG } = window.ABIS_ASSETS || {};
  const $ = (id) => document.getElementById(id);

  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const HK = 'abis_history';
  const CK = 'abis_inv_counter';
  const MAXROWS = 12;
  const MAXHIST = 100;

  // Koordinat teks di template nota (px, template 1641x2324)
  const A = {
    name: 142.0, date: 380.0, inv: 379.0, desc: 141.0, qty: 870.0,
    up: 1249.5, tot: 1498.0, idate: 140.0, grand: 1506.9, dp: 1455.1, sisa: 1454.9
  };

  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rp = (n) => 'Rp.' + num(n);
  const qfmt = (q) => String(q).replace('.', ',');
  const iso = (d) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

  function fmtDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return HARI[dt.getDay()] + ', ' + String(d).padStart(2, '0') + ' ' + BULAN[m - 1] + ' ' + y;
  }

  function fmtTs(ts) {
    try {
      return new Date(ts).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return ''; }
  }

  function toast(t) {
    const el = $('toast');
    el.textContent = t;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 2800);
  }

  // Tombol "tap dua kali untuk konfirmasi"
  function confirmTap(btn, armedText, fn) {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('arm')) {
        clearTimeout(btn._t);
        btn.classList.remove('arm');
        btn.textContent = btn.dataset.t;
        fn();
        return;
      }
      btn.dataset.t = btn.textContent;
      btn.classList.add('arm');
      btn.textContent = armedText;
      btn._t = setTimeout(() => {
        btn.classList.remove('arm');
        btn.textContent = btn.dataset.t;
      }, 3500);
    });
  }

  /* ---------- 2. Penyimpanan ---------- */
  let counter = 1;
  let editingId = null;
  try { counter = parseInt(localStorage.getItem(CK) || '1', 10) || 1; } catch (e) { /* abaikan */ }

  function loadHist() {
    try {
      const a = JSON.parse(localStorage.getItem(HK) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveHist(a) {
    try { localStorage.setItem(HK, JSON.stringify(a)); return true; } catch (e) { return false; }
  }

  /* ---------- 3. Form & item ---------- */
  function makeInv() {
    if (editingId) return;
    const s = $('dOrder').value;
    if (!s) return;
    const [y, m, d] = s.split('-');
    $('inv').value = 'ABS/' + d + m + y.slice(2) + '/' + String(counter).padStart(3, '0');
  }

  function renumber() {
    document.querySelectorAll('#abisApp .item').forEach((e, i) => {
      e.querySelector('.no').textContent = 'Item ' + (i + 1);
    });
  }

  function addItem(v) {
    v = v || {};
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML =
      '<div class="ih"><span class="grip" title="Tahan lalu geser">⠿</span>' +
      '<b class="no"></b>' +
      '<button class="x" type="button" aria-label="Hapus">×</button></div>' +
      '<label>Deskripsi</label><input class="d" placeholder="Spanduk 6*2" autocomplete="off">' +
      '<div class="row">' +
      '<div><label>Qty</label><input class="q" type="number" inputmode="decimal" placeholder="1"></div>' +
      '<div><label>Satuan (boleh kosong)</label><input class="u" autocomplete="off"></div>' +
      '</div>' +
      '<label>Harga satuan (Rp)</label>' +
      '<input class="p" type="number" inputmode="numeric" placeholder="240000">' +
      '<div class="sub">Total item: <b class="st">Rp.0</b></div>';

    el.querySelector('.d').value = v.d || '';
    el.querySelector('.q').value = v.q != null ? v.q : '';
    el.querySelector('.u').value = v.u !== undefined ? v.u : 'Pcs';
    el.querySelector('.p').value = v.p || '';

    el.querySelector('.x').onclick = () => {
      if (document.querySelectorAll('#abisApp .item').length > 1) { el.remove(); calc(); }
    };
    el.querySelector('.grip').addEventListener('pointerdown', (e) => startDrag(e, el));
    el.addEventListener('input', calc);

    $('items').appendChild(el);
    calc();
  }

  function startDrag(e, el) {
    e.preventDefault();
    const h = e.currentTarget;
    try { h.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ }
    el.classList.add('drag');

    const move = (ev) => {
      const y = ev.clientY;
      if (y < 90) window.scrollBy(0, -14);
      else if (y > window.innerHeight - 90) window.scrollBy(0, 14);

      for (const s of [...$('items').children]) {
        if (s === el) continue;
        const r = s.getBoundingClientRect();
        if (y < r.top || y > r.bottom) continue;
        const mid = r.top + r.height / 2;
        const sAfter = !!(el.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (sAfter && y > mid) $('items').insertBefore(el, s.nextSibling);
        else if (!sAfter && y < mid) $('items').insertBefore(el, s);
        break;
      }
    };
    const up = () => {
      el.classList.remove('drag');
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      calc();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  }

  function getItems() {
    return [...document.querySelectorAll('#abisApp .item')]
      .map((e) => {
        const qv = parseFloat(e.querySelector('.q').value);
        const d = e.querySelector('.d').value.trim();
        return {
          d,
          q: isNaN(qv) || qv <= 0 ? 1 : qv,
          u: e.querySelector('.u').value.trim(),
          p: parseFloat(e.querySelector('.p').value) || 0,
          raw: d || e.querySelector('.p').value
        };
      })
      .filter((i) => i.raw)
      .map(({ d, q, u, p }) => ({ d, q, u, p }));
  }

  function collect() {
    return {
      cust: $('cust').value.trim(),
      dOrder: $('dOrder').value,
      dInv: $('dInv').value,
      inv: $('inv').value.trim(),
      dp: parseFloat($('dp').value) || 0,
      items: getItems()
    };
  }

  function totals(d) {
    const total = d.items.reduce((s, i) => s + i.q * i.p, 0);
    return { total, dp: d.dp, sisa: Math.max(total - d.dp, 0) };
  }

  function calc() {
    renumber();
    document.querySelectorAll('#abisApp .item').forEach((e) => {
      const qv = parseFloat(e.querySelector('.q').value);
      const q = isNaN(qv) || qv <= 0 ? 1 : qv;
      e.querySelector('.st').textContent = rp(q * (parseFloat(e.querySelector('.p').value) || 0));
    });
    const t = totals(collect());
    $('sTotal').textContent = rp(t.total);
    $('sDp').textContent = rp(t.dp);
    $('sSisa').textContent = rp(t.sisa);
  }

  function setBanner(t) {
    const b = $('banner');
    if (!t) { b.hidden = true; return; }
    $('bannerTx').textContent = t;
    b.hidden = false;
  }

  function newNota() {
    editingId = null;
    $('cust').value = '';
    $('dp').value = '';
    $('dOrder').value = iso(new Date());
    $('dInv').value = iso(new Date());
    $('items').innerHTML = '';
    addItem();
    makeInv();
    setBanner('');
    $('abisMsg').textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 4. Pembuatan PDF ---------- */
  const K = 595.28 / 1641; // px template -> pt A4

  function buildPDF(data) {
    if (!window.jspdf) throw new Error('jspdf-missing');
    if (!FONTS || !BG) throw new Error('assets-missing');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: [595.28, 841.89] });

    [['R', 'Poppins-Regular'], ['M', 'Poppins-Medium'], ['B', 'Poppins-Bold']].forEach(([k, n]) => {
      doc.addFileToVFS(n + '.ttf', FONTS[k]);
      doc.addFont(n + '.ttf', n, 'normal');
    });
    doc.addImage(BG, 'JPEG', 0, 0, 595.28, 841.89);

    const FN = { R: 'Poppins-Regular', M: 'Poppins-Medium', B: 'Poppins-Bold' };
    const BLACK = [0, 0, 0];
    const NAVY = [12, 33, 86];

    function T(t, x, y, f, size, col, align, maxW) {
      if (!t) return;
      doc.setFont(FN[f], 'normal');
      doc.setTextColor(col[0], col[1], col[2]);
      let s = size * K;
      doc.setFontSize(s);
      if (maxW) {
        while (doc.getTextWidth(t) > maxW * K && s > size * K * 0.55) {
          s -= 0.25;
          doc.setFontSize(s);
        }
      }
      doc.text(t, x * K, y * K, { align: align || 'left' });
    }

    T(data.cust, A.name, 429, 'B', 49.5, BLACK, 'left', 930);
    T(fmtDate(data.dOrder), A.date, 485, 'M', 28.8, BLACK, 'left', 520);
    T(data.inv, A.inv, 527, 'M', 28.8, BLACK, 'left', 520);

    const items = data.items;
    const { total, dp, sisa } = totals(data);
    if (items.length > MAXROWS) throw new Error('overflow');

    const BASE = 745;
    const PITCH = 53.25;
    const last = BASE + (items.length - 1) * PITCH + 11;

    // Baris selang-seling (zebra)
    doc.setFillColor(135, 175, 255);
    items.forEach((it, i) => {
      if (i % 2 === 1) {
        const top = BASE + i * PITCH - 43.25;
        doc.setGState(new doc.GState({ opacity: 0.1 }));
        doc.rect(132 * K, top * K, (1508 - 132) * K, 56 * K, 'F');
        doc.setGState(new doc.GState({ opacity: 1 }));
      }
    });

    // Garis pemisah kolom
    doc.setDrawColor(205, 207, 211);
    doc.setLineWidth(2.4 * K);
    [779, 960, 1258].forEach((x) => doc.line(x * K, 713 * K, x * K, last * K));

    items.forEach((it, i) => {
      const y = BASE + i * PITCH;
      T(it.d, A.desc, y, 'R', 28.2, BLACK, 'left', 600);
      T('x' + qfmt(it.q) + (it.u ? ' ' + it.u : ''), A.qty, y, 'R', 28.2, BLACK, 'center', 150);
      T(rp(it.p) + ',-', A.up, y, 'R', 28.2, BLACK, 'right', 270);
      T(rp(it.q * it.p) + ',-', A.tot, y, 'R', 28.2, BLACK, 'right', 230);
    });

    T(fmtDate(data.dInv), A.idate, 1599, 'R', 42.5, NAVY, 'left', 600);
    T(rp(total), A.grand, 1597, 'B', 54.4, NAVY, 'right', 600);
    T(rp(dp), A.dp, 1770, 'R', 31.6, NAVY, 'right', 320);
    T(rp(sisa), A.sisa, 1849, 'B', 32, NAVY, 'right', 320);
    return doc;
  }

  function fileName(d) {
    const who = (d.cust || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    return (who ? 'Invoice - ' + who : 'Invoice') + '.pdf';
  }

  function save(doc, name) {
    const buf = doc.output('arraybuffer');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'ok';
  }

  function doDownload(data) {
    try {
      return save(buildPDF(data), fileName(data));
    } catch (e) {
      console.error(e);
      return e.message === 'overflow' ? 'overflow' : 'err';
    }
  }

  /* ---------- 5. Riwayat nota ---------- */
  function recordHistory(data) {
    const h = loadHist();
    const now = Date.now();
    const t = totals(data);
    const rec = Object.assign({}, data, { total: t.total, upd: now });
    const i = editingId ? h.findIndex((x) => x.id === editingId) : -1;

    if (i >= 0) {
      rec.id = h[i].id;
      rec.ts = h[i].ts;
      h[i] = rec;
    } else {
      rec.id = editingId || ('n' + now + Math.random().toString(36).slice(2, 6));
      rec.ts = now;
      h.unshift(rec);
      if (!editingId) {
        counter++;
        try { localStorage.setItem(CK, String(counter)); } catch (e) { /* abaikan */ }
      }
      editingId = rec.id;
    }
    h.splice(MAXHIST);
    const ok = saveHist(h);
    renderHist();
    return ok;
  }

  function openHist(id) {
    const e = loadHist().find((x) => x.id === id);
    if (!e) return;
    editingId = id;
    $('cust').value = e.cust || '';
    $('dOrder').value = e.dOrder || iso(new Date());
    $('dInv').value = e.dInv || iso(new Date());
    $('inv').value = e.inv || '';
    $('dp').value = e.dp ? e.dp : '';
    $('items').innerHTML = '';
    (e.items && e.items.length ? e.items : [{}]).forEach(addItem);
    setBanner('Mengedit nota riwayat (' + (e.inv || '-') + '). Download akan memperbarui nota ini.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Nota dibuka. Silakan ubah lalu download lagi.');
  }

  function downloadMessage(r, e) {
    if (r === 'ok') return 'PDF siap: ' + fileName(e);
    if (r === 'overflow') return 'Item terlalu banyak.';
    return 'Gagal membuat PDF.';
  }

  function renderHist() {
    const all = loadHist();
    const q = $('hSearch').value.trim().toLowerCase();
    const list = all.filter((e) => !q || ((e.cust || '') + ' ' + (e.inv || '')).toLowerCase().includes(q));
    $('hCount').textContent = all.length + ' nota';

    const box = $('hList');
    box.innerHTML = '';

    if (!list.length) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = all.length
        ? 'Tidak ada yang cocok.'
        : 'Belum ada riwayat. Nota yang di-download akan muncul di sini.';
      box.appendChild(p);
      return;
    }

    list.forEach((e) => {
      const w = document.createElement('div');
      w.className = 'he';

      const m = document.createElement('div');
      m.className = 'hm';
      const b = document.createElement('b');
      b.textContent = e.cust || '(tanpa nama)';
      const tt = document.createElement('span');
      tt.className = 'tt';
      tt.textContent = rp(e.total || 0);
      m.append(b, tt);

      const s = document.createElement('div');
      s.className = 'hs';
      s.textContent = (e.inv || '-') + ' · ' + (e.items ? e.items.length : 0) + ' item · ' + fmtTs(e.upd || e.ts);

      const bar = document.createElement('div');
      bar.className = 'hb';

      const o = document.createElement('button');
      o.type = 'button';
      o.className = 'sm';
      o.textContent = 'Buka & Edit';
      o.onclick = () => openHist(e.id);

      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'sm';
      d.textContent = 'Download';
      d.onclick = () => toast(downloadMessage(doDownload(e), e));

      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'sm d';
      x.textContent = 'Hapus';
      confirmTap(x, 'Yakin? Tap lagi', () => {
        saveHist(loadHist().filter((z) => z.id !== e.id));
        if (editingId === e.id) { editingId = null; setBanner(''); makeInv(); }
        renderHist();
        toast('Nota dihapus dari riwayat.');
      });

      bar.append(o, d, x);
      w.append(m, s, bar);
      box.appendChild(w);
    });
  }

  /* ---------- 6. Event utama & inisialisasi ---------- */
  function onGenerate() {
    const m = $('abisMsg');
    const data = collect();
    if (!data.items.length) { m.textContent = 'Isi minimal 1 item.'; return; }

    m.textContent = 'Membuat PDF...';
    const r = doDownload(data);

    if (r === 'ok') {
      const ok = recordHistory(data);
      m.textContent = 'PDF siap: ' + fileName(data);
      setBanner('Tersimpan di riwayat. Ubah data lalu download lagi untuk memperbarui, atau tekan Nota Baru.');
      if (!ok) toast('Riwayat tidak bisa disimpan di browser ini.');
    } else if (r === 'overflow') {
      m.textContent = 'Item maksimal ' + MAXROWS + ' baris.';
    } else {
      m.textContent = 'Gagal membuat PDF, coba lagi.';
    }
  }

  function initEvents() {
    $('dOrder').addEventListener('change', makeInv);
    $('dp').addEventListener('input', calc);
    $('addBtn').onclick = () => addItem();
    $('newBtn').onclick = newNota;
    $('hSearch').addEventListener('input', renderHist);
    $('go').onclick = onGenerate;

    confirmTap($('clrHist'), 'Yakin hapus semua? Tap lagi', () => {
      saveHist([]);
      editingId = null;
      setBanner('');
      makeInv();
      renderHist();
      toast('Semua riwayat dihapus.');
    });

    confirmTap($('clrAll'), 'Yakin reset total? Tap lagi', () => {
      try { localStorage.removeItem(HK); localStorage.removeItem(CK); } catch (e) { /* abaikan */ }
      counter = 1;
      newNota();
      renderHist();
      toast('Reset total selesai. Nomor mulai dari 001.');
    });
  }

  /* ---------- 7. Layout header ----------
     - Jika header eksternal berposisi fixed, beri jarak atas pada
       aplikasi supaya konten tidak tertutup header.
     - Jika header eksternal gagal tampil, tampilkan header cadangan. */
  function initHeaderLayout() {
    const root = $('fa-header-root');
    const app = $('abisApp');
    const fb = $('abis-header-fallback');
    if (!root || !app) return;

    const GAP = 16;
    let pageLoaded = document.readyState === 'complete';

    function fixedHeight(el) {
      return getComputedStyle(el).position === 'fixed' ? el.offsetHeight : 0;
    }

    function sync() {
      const hasHeader = root.children.length > 0;
      let h = fixedHeight(root);
      [...root.children].forEach((c) => { h = Math.max(h, fixedHeight(c)); });
      app.style.paddingTop = (h + GAP) + 'px';
      if (fb) fb.hidden = hasHeader || !pageLoaded;
    }

    new MutationObserver(sync).observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', sync);
    if (!pageLoaded) {
      window.addEventListener('load', () => { setTimeout(() => { pageLoaded = true; sync(); }, 1200); });
    } else {
      setTimeout(sync, 1200);
    }
    sync();
  }

  function init() {
    $('dOrder').value = iso(new Date());
    $('dInv').value = iso(new Date());
    initEvents();
    makeInv();
    addItem();
    renderHist();
    initHeaderLayout();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
