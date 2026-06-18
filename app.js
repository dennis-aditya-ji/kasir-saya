// ============================================================
// KASIR PWA - APP LOGIC
// ============================================================

let STATE = {
  produk: [],
  keranjang: [], // { produkId, nama, varian, harga, qty }
  riwayat: [],
  pengaturan: {},
  editingTrxId: null,
  pin: null,
  trxTerakhir: null
};

// ============ HELPERS ============

function formatRupiah(angka) {
  const n = Number(angka) || 0;
  return 'Rp ' + n.toLocaleString('id-ID');
}

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast ' + type; }, 2500);
}

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Memuat...';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}

let confirmCallback = null;
function askConfirm(title, text, onYes) {
  document.getElementById('konfirmasiTitle').textContent = title;
  document.getElementById('konfirmasiText').textContent = text;
  confirmCallback = onYes;
  showModal('modalKonfirmasi');
}

// ============ LOGIN / PIN ============

function simpanPinSesi(pin) {
  STATE.pin = pin;
  try { sessionStorage.setItem('kasir_pin', pin); } catch (e) {}
}

function ambilPinSesi() {
  if (STATE.pin) return STATE.pin;
  try { return sessionStorage.getItem('kasir_pin'); } catch (e) { return null; }
}

function hapusPinSesi() {
  STATE.pin = null;
  try { sessionStorage.removeItem('kasir_pin'); } catch (e) {}
}

function simpanLogoTerakhir(url) {
  try { sessionStorage.setItem('kasir_logo_url', url || ''); } catch (e) {}
}

function ambilLogoTerakhir() {
  try { return sessionStorage.getItem('kasir_logo_url') || CONFIG.LOGO_URL; } catch (e) { return CONFIG.LOGO_URL; }
}

// Pasang gambar dengan fallback otomatis ke placeholder jika URL gagal dimuat
// (mencegah ikon "gambar rusak" tampil di layar)
function setGambarDenganFallback(imgElement, url) {
  imgElement.onerror = () => {
    imgElement.onerror = null; // hindari loop tak berhenti jika placeholder juga gagal
    imgElement.src = CONFIG.LOGO_URL;
  };
  imgElement.src = url || CONFIG.LOGO_URL;
}

async function cobaLogin() {
  const pinInput = document.getElementById('loginPinInput').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!pinInput) { errorEl.textContent = 'PIN tidak boleh kosong'; return; }

  const btn = document.getElementById('btnLoginSubmit');
  btn.disabled = true;
  btn.textContent = 'Memeriksa...';

  try {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', 'cekLogin');
    url.searchParams.set('pin', pinInput);
    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.valid) {
      simpanPinSesi(pinInput);
      maskukKeApp();
    } else {
      errorEl.textContent = json.message || 'PIN salah';
      document.getElementById('loginPinInput').value = '';
    }
  } catch (err) {
    errorEl.textContent = 'Gagal terhubung ke server. Cek koneksi internet.';
  }

  btn.disabled = false;
  btn.textContent = 'Masuk';
}

function maskukKeApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');
  initApp();
}

function logout() {
  askConfirm('Keluar?', 'Anda perlu masukkan PIN lagi untuk masuk ke aplikasi.', () => {
    hapusPinSesi();
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginPinInput').value = '';
  });
}

// ============ API CALLS ============

async function apiCall(action, params = {}) {
  const url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('pin', ambilPinSesi() || '');
  Object.keys(params).forEach(key => {
    const val = typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key];
    url.searchParams.set(key, val);
  });

  const res = await fetch(url.toString());
  const json = await res.json();

  if (json.needLogin) {
    hapusPinSesi();
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    throw new Error(json.message || 'Sesi berakhir, silakan masuk lagi');
  }

  if (!json.success) throw new Error(json.message || 'Terjadi kesalahan');
  return json;
}

// ============ NAVIGATION ============

function gotoPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById('page-' + pageName);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetNav = document.querySelector(`.nav-item[data-page="${pageName}"]`);
  if (targetNav) targetNav.classList.add('active');

  const subtitleMap = {
    kasir: 'Kasir',
    produk: 'Kelola Produk',
    riwayat: 'Riwayat Transaksi',
    laporan: 'Laporan Bulanan',
    pengaturan: 'Pengaturan'
  };
  const subtitleEl = document.getElementById('pageSubtitle');
  if (subtitleEl) subtitleEl.textContent = subtitleMap[pageName] || '';

  try {
    if (pageName === 'produk') renderProdukManage();
    if (pageName === 'riwayat') loadRiwayat();
    if (pageName === 'laporan') loadLaporan();
  } catch (err) {
    console.error('Gagal memuat halaman ' + pageName + ':', err);
  }
}

// ============ INIT ============

let appSudahDiinit = false;

async function initApp() {
  applyConfigPlaceholders();
  if (!appSudahDiinit) {
    setupEventListeners();
    appSudahDiinit = true;
  }

  const now = new Date();
  const bulanInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('filterBulanRiwayat').value = bulanInput;
  document.getElementById('filterBulanLaporan').value = bulanInput;

  showLoading('Memuat data...');
  try {
    await Promise.all([loadProduk(), loadPengaturan()]);
  } catch (err) {
    showToast('Gagal memuat data: ' + err.message, 'error');
  }
  hideLoading();

  registerServiceWorker();
}

async function initLoginScreen() {
  setGambarDenganFallback(document.getElementById('loginLogo'), ambilLogoTerakhir());
  document.title = CONFIG.APP_NAME;
  document.getElementById('btnLoginSubmit').addEventListener('click', cobaLogin);
  document.getElementById('loginPinInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') cobaLogin();
  });

  // Jika ada PIN tersimpan dari sesi sebelumnya (belum logout/tutup tab),
  // langsung verifikasi ke server tanpa minta input ulang.
  const pinTersimpan = ambilPinSesi();
  if (pinTersimpan) {
    try {
      const url = new URL(CONFIG.API_URL);
      url.searchParams.set('action', 'cekLogin');
      url.searchParams.set('pin', pinTersimpan);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (json.valid) {
        maskukKeApp();
        return;
      } else {
        hapusPinSesi();
      }
    } catch (e) {
      // gagal cek (misal offline) -> tetap tampilkan layar login
    }
  }
}

function applyConfigPlaceholders() {
  setGambarDenganFallback(document.getElementById('headerLogo'), CONFIG.LOGO_URL);
  document.title = CONFIG.APP_NAME;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ============ PRODUK: LOAD & RENDER (KASIR) ============

async function loadProduk() {
  const res = await apiCall('getProduk');
  STATE.produk = res.data;
  renderProdukKasir();
}

function renderProdukKasir(filter = '') {
  const container = document.getElementById('listProdukKasir');
  const keyword = filter.toLowerCase();

  const filtered = STATE.produk.filter(p =>
    p.aktif && (p.nama.toLowerCase().includes(keyword) || (p.varian || '').toLowerCase().includes(keyword))
  );

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">Belum ada produk. Tambahkan dulu di menu Produk.</p>';
    return;
  }

  container.innerHTML = filtered.map(p => {
    const stokRendah = p.stok <= 3;
    const habis = p.stok <= 0;
    return `
      <div class="produk-card ${habis ? 'out-of-stock' : ''}" onclick="tambahKeKeranjang('${p.id}')">
        <div class="produk-card-nama">${escapeHtml(p.nama)}</div>
        ${p.varian ? `<div class="produk-card-varian">${escapeHtml(p.varian)}</div>` : ''}
        <div class="produk-card-harga">${formatRupiah(p.harga)}</div>
        <div class="produk-card-stok ${stokRendah ? 'low' : ''}">Stok: ${p.stok}</div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ============ KERANJANG ============

function tambahKeKeranjang(produkId) {
  const produk = STATE.produk.find(p => p.id === produkId);
  if (!produk) return;
  if (produk.stok <= 0) { showToast('Stok produk habis', 'error'); return; }

  const existing = STATE.keranjang.find(k => k.produkId === produkId);
  const qtyDiKeranjang = existing ? existing.qty : 0;

  if (qtyDiKeranjang + 1 > produk.stok) {
    showToast('Stok tidak cukup', 'error');
    return;
  }

  if (existing) {
    existing.qty += 1;
  } else {
    STATE.keranjang.push({
      produkId: produk.id,
      nama: produk.nama,
      varian: produk.varian,
      harga: produk.harga,
      qty: 1
    });
  }
  renderKeranjang();
}

function ubahQty(produkId, delta) {
  const item = STATE.keranjang.find(k => k.produkId === produkId);
  if (!item) return;

  const produk = STATE.produk.find(p => p.id === produkId);
  const qtyBaru = item.qty + delta;

  if (qtyBaru <= 0) {
    STATE.keranjang = STATE.keranjang.filter(k => k.produkId !== produkId);
  } else if (produk && qtyBaru > produk.stok) {
    showToast('Stok tidak cukup', 'error');
    return;
  } else {
    item.qty = qtyBaru;
  }
  renderKeranjang();
}

function renderKeranjang() {
  const container = document.getElementById('listKeranjang');

  if (STATE.keranjang.length === 0) {
    container.innerHTML = '<p class="empty-state">Belum ada item. Pilih produk di sebelah kiri.</p>';
  } else {
    container.innerHTML = STATE.keranjang.map(item => `
      <div class="keranjang-item">
        <div class="keranjang-item-info">
          <div class="keranjang-item-nama">${escapeHtml(item.nama)}</div>
          <div class="keranjang-item-sub">${item.varian ? escapeHtml(item.varian) + ' &middot; ' : ''}${formatRupiah(item.harga)}</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn" onclick="ubahQty('${item.produkId}', -1)">&minus;</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="ubahQty('${item.produkId}', 1)">+</button>
        </div>
        <div class="keranjang-item-subtotal mono">${formatRupiah(item.harga * item.qty)}</div>
      </div>
    `).join('');
  }

  hitungTotal();
}

function hitungTotal() {
  const total = STATE.keranjang.reduce((sum, item) => sum + item.harga * item.qty, 0);
  document.getElementById('totalBelanja').textContent = formatRupiah(total);
  hitungKembalian();
  return total;
}

function hitungKembalian() {
  const total = STATE.keranjang.reduce((sum, item) => sum + item.harga * item.qty, 0);
  const diterima = Number(document.getElementById('uangDiterima').value) || 0;
  const kembalian = diterima - total;
  document.getElementById('kembalianText').textContent = formatRupiah(kembalian < 0 ? 0 : kembalian);
}

function kosongkanKeranjang() {
  STATE.keranjang = [];
  document.getElementById('uangDiterima').value = '';
  renderKeranjang();
}

// ============ TRANSAKSI ============

async function prosesTransaksi() {
  if (STATE.keranjang.length === 0) {
    showToast('Keranjang masih kosong', 'error');
    return;
  }

  const total = hitungTotal();
  const metodeBayar = document.getElementById('metodeBayar').value;
  const uangDiterima = Number(document.getElementById('uangDiterima').value) || 0;

  if (metodeBayar === 'Tunai' && uangDiterima < total) {
    showToast('Uang diterima kurang dari total', 'error');
    return;
  }

  const kembalian = metodeBayar === 'Tunai' ? (uangDiterima - total) : 0;

  const transaksi = {
    tanggal: new Date().toISOString(),
    item: STATE.keranjang.map(k => ({
      produkId: k.produkId, nama: k.nama, varian: k.varian, harga: k.harga, qty: k.qty
    })),
    total,
    metodeBayar,
    uangDiterima: metodeBayar === 'Tunai' ? uangDiterima : total,
    kembalian,
    catatan: ''
  };

  showLoading('Menyimpan transaksi...');
  try {
    await apiCall('simpanTransaksi', { data: transaksi });
    tampilkanStruk(transaksi);
    kosongkanKeranjang();
    await loadProduk(); // refresh stok
    showToast('Transaksi berhasil disimpan', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
  hideLoading();
}

function tampilkanStruk(trx) {
  STATE.trxTerakhir = trx;
  const set = STATE.pengaturan;
  const tgl = new Date(trx.tanggal);
  const tglFormat = tgl.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  // Tampilan HTML tetap dipakai untuk preview di dalam modal (mudah dibaca & di-scroll)
  const itemRows = trx.item.map(it => `
    <div class="struk-row">
      <span>${escapeHtml(it.nama)}${it.varian ? ' (' + escapeHtml(it.varian) + ')' : ''} x${it.qty}</span>
      <span>${formatRupiah(it.harga * it.qty)}</span>
    </div>
  `).join('');

  document.getElementById('strukContent').innerHTML = `
    ${set.logo_url ? `<img src="${set.logo_url}" class="struk-logo" onerror="this.style.display='none'" />` : ''}
    <div class="struk-center struk-bold">${escapeHtml(set.nama_toko || 'TOKO SAYA')}</div>
    <div class="struk-center">${escapeHtml(set.alamat || '')}</div>
    <div class="struk-center">${escapeHtml(set.telepon || '')}</div>
    <div class="struk-divider"></div>
    <div>${tglFormat}</div>
    <div class="struk-divider"></div>
    ${itemRows}
    <div class="struk-divider"></div>
    <div class="struk-row struk-bold"><span>TOTAL</span><span>${formatRupiah(trx.total)}</span></div>
    <div class="struk-row"><span>Metode</span><span>${trx.metodeBayar}</span></div>
    <div class="struk-row"><span>Dibayar</span><span>${formatRupiah(trx.uangDiterima)}</span></div>
    <div class="struk-row"><span>Kembalian</span><span>${formatRupiah(trx.kembalian)}</span></div>
    <div class="struk-divider"></div>
    <div class="struk-center">${escapeHtml(set.catatan_struk || 'Terima kasih')}</div>
  `;

  showModal('modalStruk');
}

// Menggambar struk sebagai gambar PNG asli (bukan teks) menggunakan Canvas API,
// supaya hasil yang dibagikan tidak bisa di-copy/edit teksnya oleh penerima.
async function renderStrukKeCanvas(trx) {
  // Pastikan font JetBrains Mono sudah selesai dimuat sebelum digambar di canvas,
  // supaya tidak fallback diam-diam ke font default browser.
  try { await document.fonts.ready; } catch (e) {}

  const set = STATE.pengaturan;
  const tgl = new Date(trx.tanggal);
  const tglFormat = tgl.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  const W = 360; // lebar struk dalam px (mirip lebar kertas thermal 58-80mm di skala layar)
  const PAD = 20;
  const lineHeight = 20;
  const fontMain = '13px "JetBrains Mono", monospace';
  const fontBold = 'bold 13px "JetBrains Mono", monospace';
  const fontHeader = 'bold 15px "JetBrains Mono", monospace';

  // Coba muat logo dulu (jika ada) sebelum menghitung tinggi & menggambar
  let logoImg = null;
  if (set.logo_url) {
    logoImg = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = set.logo_url;
    });
  }

  // Hitung dulu berapa baris yang dibutuhkan tiap item (nama bisa wrap jika kepanjangan)
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = fontMain;
  const maxTextWidth = W - PAD * 2 - 70; // sisakan ruang untuk harga di kanan

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    words.forEach(word => {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  const itemLines = trx.item.map(it => {
    const label = `${it.nama}${it.varian ? ' (' + it.varian + ')' : ''} x${it.qty}`;
    return wrapText(tempCtx, label, maxTextWidth);
  });
  const totalItemLines = itemLines.reduce((sum, lines) => sum + lines.length, 0);

  // Hitung tinggi total canvas
  let H = PAD * 2;
  H += logoImg ? 60 : 0;
  H += lineHeight * 1.3; // nama toko
  H += set.alamat ? lineHeight : 0;
  H += set.telepon ? lineHeight : 0;
  H += 16; // divider
  H += lineHeight; // tanggal
  H += 16; // divider
  H += totalItemLines * lineHeight;
  H += 16; // divider
  H += lineHeight * 4; // total, metode, dibayar, kembalian
  H += 16; // divider
  H += lineHeight * 1.5; // catatan

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Background putih bersih
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#1a1a1a';
  ctx.textBaseline = 'top';

  let y = PAD;

  if (logoImg) {
    const logoSize = 50;
    ctx.drawImage(logoImg, (W - logoSize) / 2, y, logoSize, logoSize);
    y += 60;
  }

  function drawCenter(text, font) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, y);
    ctx.textAlign = 'left';
    y += lineHeight;
  }

  function drawDivider() {
    ctx.strokeStyle = '#cccccc';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD, y + 6);
    ctx.lineTo(W - PAD, y + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 16;
  }

  function drawRow(left, right, font) {
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.fillText(left, PAD, y);
    ctx.textAlign = 'right';
    ctx.fillText(right, W - PAD, y);
    y += lineHeight;
  }

  drawCenter(set.nama_toko || 'TOKO SAYA', fontHeader);
  if (set.alamat) drawCenter(set.alamat, fontMain);
  if (set.telepon) drawCenter(set.telepon, fontMain);
  drawDivider();
  ctx.font = fontMain;
  ctx.textAlign = 'left';
  ctx.fillText(tglFormat, PAD, y);
  y += lineHeight;
  drawDivider();

  trx.item.forEach((it, idx) => {
    const lines = itemLines[idx];
    const subtotal = formatRupiah(it.harga * it.qty);
    lines.forEach((line, i) => {
      if (i === lines.length - 1) {
        drawRow(line, subtotal, fontMain);
      } else {
        ctx.font = fontMain;
        ctx.textAlign = 'left';
        ctx.fillText(line, PAD, y);
        y += lineHeight;
      }
    });
  });

  drawDivider();
  drawRow('TOTAL', formatRupiah(trx.total), fontBold);
  drawRow('Metode', trx.metodeBayar, fontMain);
  drawRow('Dibayar', formatRupiah(trx.uangDiterima), fontMain);
  drawRow('Kembalian', formatRupiah(trx.kembalian), fontMain);
  drawDivider();
  drawCenter(set.catatan_struk || 'Terima kasih', fontMain);

  return canvas;
}

async function bagikanStruk() {
  if (!STATE.trxTerakhir) { showToast('Data struk tidak ditemukan', 'error'); return; }

  const btn = document.getElementById('btnBagikanStruk');
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  try {
    let canvas = await renderStrukKeCanvas(STATE.trxTerakhir);
    let blob = await cobaCanvasKeBlob(canvas);

    if (!blob) {
      // Kemungkinan logo gagal diekspor karena CORS (canvas "tainted").
      // Render ulang tanpa logo agar struk tetap bisa dibagikan.
      const logoAsli = STATE.pengaturan.logo_url;
      STATE.pengaturan.logo_url = '';
      canvas = await renderStrukKeCanvas(STATE.trxTerakhir);
      STATE.pengaturan.logo_url = logoAsli;
      blob = await cobaCanvasKeBlob(canvas);
    }

    if (!blob) throw new Error('Gagal membuat gambar struk');

    const fileName = `struk-${Date.now()}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Struk Belanja' });
    } else {
      // Fallback: unduh langsung sebagai file gambar jika Web Share API
      // untuk file tidak didukung oleh browser ini.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Struk diunduh sebagai gambar', 'success');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast('Gagal membagikan struk: ' + err.message, 'error');
    }
  }

  btn.disabled = false;
  btn.textContent = 'Bagikan';
}

function cobaCanvasKeBlob(canvas) {
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob), 'image/png');
    } catch (e) {
      resolve(null);
    }
  });
}

// ============ PRODUK: MANAGE (CRUD) ============

function renderProdukManage(filter = '') {
  const container = document.getElementById('listProdukManage');
  const keyword = filter.toLowerCase();
  const filtered = STATE.produk.filter(p =>
    p.nama.toLowerCase().includes(keyword) || (p.varian || '').toLowerCase().includes(keyword)
  );

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state" style="color:#999">Belum ada produk.</p>';
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div class="produk-manage-item">
      <div class="produk-manage-info">
        <div class="produk-manage-nama">${escapeHtml(p.nama)}${p.varian ? ' - ' + escapeHtml(p.varian) : ''}</div>
        <div class="produk-manage-meta">${formatRupiah(p.harga)} &middot; Stok: ${p.stok}${p.kategori ? ' &middot; ' + escapeHtml(p.kategori) : ''}</div>
      </div>
      <div class="produk-manage-actions">
        <button class="icon-btn" onclick="bukaEditProduk('${p.id}')">&#9998;</button>
        <button class="icon-btn danger" onclick="konfirmasiHapusProduk('${p.id}')">&#128465;</button>
      </div>
    </div>
  `).join('');
}

function bukaTambahProduk() {
  document.getElementById('modalProdukTitle').textContent = 'Tambah Produk';
  document.getElementById('produkId').value = '';
  document.getElementById('produkNama').value = '';
  document.getElementById('produkVarian').value = '';
  document.getElementById('produkHarga').value = '';
  document.getElementById('produkStok').value = '';
  document.getElementById('produkKategori').value = '';
  showModal('modalProduk');
}

function bukaEditProduk(id) {
  const p = STATE.produk.find(x => x.id === id);
  if (!p) return;
  document.getElementById('modalProdukTitle').textContent = 'Edit Produk';
  document.getElementById('produkId').value = p.id;
  document.getElementById('produkNama').value = p.nama;
  document.getElementById('produkVarian').value = p.varian || '';
  document.getElementById('produkHarga').value = p.harga;
  document.getElementById('produkStok').value = p.stok;
  document.getElementById('produkKategori').value = p.kategori || '';
  showModal('modalProduk');
}

async function simpanProduk() {
  const nama = document.getElementById('produkNama').value.trim();
  const harga = Number(document.getElementById('produkHarga').value);
  const stok = Number(document.getElementById('produkStok').value);

  if (!nama) { showToast('Nama produk wajib diisi', 'error'); return; }
  if (isNaN(harga) || harga < 0) { showToast('Harga tidak valid', 'error'); return; }

  const data = {
    id: document.getElementById('produkId').value || null,
    nama,
    varian: document.getElementById('produkVarian').value.trim(),
    harga,
    stok: isNaN(stok) ? 0 : stok,
    kategori: document.getElementById('produkKategori').value.trim(),
    aktif: true
  };

  showLoading('Menyimpan produk...');
  try {
    await apiCall('simpanProduk', { data });
    hideModal('modalProduk');
    await loadProduk();
    renderProdukManage(document.getElementById('searchProdukManage').value);
    showToast('Produk tersimpan', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
  hideLoading();
}

function konfirmasiHapusProduk(id) {
  askConfirm('Hapus Produk?', 'Produk yang dihapus tidak dapat dikembalikan.', async () => {
    showLoading('Menghapus...');
    try {
      await apiCall('hapusProduk', { id });
      await loadProduk();
      renderProdukManage(document.getElementById('searchProdukManage').value);
      showToast('Produk dihapus', 'success');
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    }
    hideLoading();
  });
}

// ============ RIWAYAT ============

async function loadRiwayat() {
  const bulanInput = document.getElementById('filterBulanRiwayat').value;
  if (!bulanInput) return;
  const [tahun, bulan] = bulanInput.split('-');

  showLoading('Memuat riwayat...');
  try {
    const res = await apiCall('getTransaksi', { bulan: Number(bulan), tahun: Number(tahun) });
    STATE.riwayat = res.data;
    renderRiwayat();
  } catch (err) {
    showToast('Gagal memuat riwayat: ' + err.message, 'error');
  }
  hideLoading();
}

function renderRiwayat() {
  const container = document.getElementById('listRiwayat');
  if (STATE.riwayat.length === 0) {
    container.innerHTML = '<p class="empty-state" style="color:#999">Belum ada transaksi di bulan ini.</p>';
    return;
  }

  container.innerHTML = STATE.riwayat.map(t => {
    const tgl = new Date(t.tanggal).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const itemText = t.item.map(i => `${i.nama}${i.varian ? ' (' + i.varian + ')' : ''} x${i.qty}`).join(', ');
    return `
      <div class="riwayat-item">
        <div class="riwayat-top">
          <div>
            <div class="riwayat-tanggal">${tgl}</div>
            <span class="riwayat-metode">${t.metodeBayar}</span>
          </div>
          <div class="riwayat-total mono">${formatRupiah(t.total)}</div>
        </div>
        <div class="riwayat-items">${escapeHtml(itemText)}</div>
        ${t.catatan ? `<div class="riwayat-items" style="font-style:italic">Catatan: ${escapeHtml(t.catatan)}</div>` : ''}
        <div class="riwayat-actions">
          <button class="btn btn-ghost" style="border-color:#ddd;color:#555" onclick="bagikanStrukDariRiwayat('${t.id}')">Bagikan</button>
          <button class="btn btn-ghost" style="border-color:#ddd;color:#555" onclick="bukaEditTransaksi('${t.id}')">Edit</button>
          <button class="btn btn-danger" onclick="konfirmasiHapusTransaksi('${t.id}')">Hapus</button>
        </div>
      </div>
    `;
  }).join('');
}

function bukaEditTransaksi(id) {
  const t = STATE.riwayat.find(x => x.id === id);
  if (!t) return;

  STATE.editingTrxId = id;
  document.getElementById('editTrxId').value = id;
  document.getElementById('editTrxMetode').value = t.metodeBayar;
  document.getElementById('editTrxCatatan').value = t.catatan || '';

  const itemContainer = document.getElementById('editTrxItemList');
  itemContainer.innerHTML = t.item.map((it, idx) => `
    <div class="edit-trx-item-row">
      <span>${escapeHtml(it.nama)}${it.varian ? ' (' + escapeHtml(it.varian) + ')' : ''}</span>
      <div class="qty-control" style="margin-left:0">
        <button class="qty-btn" style="background:#eee;color:#333" onclick="ubahQtyEditTrx(${idx}, -1)">&minus;</button>
        <span class="qty-value" id="editQty${idx}" style="color:#333">${it.qty}</span>
        <button class="qty-btn" style="background:#eee;color:#333" onclick="ubahQtyEditTrx(${idx}, 1)">+</button>
      </div>
    </div>
  `).join('');

  showModal('modalEditTrx');
}

function ubahQtyEditTrx(idx, delta) {
  const t = STATE.riwayat.find(x => x.id === STATE.editingTrxId);
  if (!t) return;
  const newQty = t.item[idx].qty + delta;
  if (newQty <= 0) { showToast('Qty minimal 1, hapus via tombol Hapus transaksi jika perlu', 'error'); return; }
  t.item[idx].qty = newQty;
  document.getElementById('editQty' + idx).textContent = newQty;
}

async function simpanEditTransaksi() {
  const t = STATE.riwayat.find(x => x.id === STATE.editingTrxId);
  if (!t) return;

  const total = t.item.reduce((sum, it) => sum + it.harga * it.qty, 0);
  const metodeBaru = document.getElementById('editTrxMetode').value;

  // Hitung ulang uang diterima & kembalian berdasarkan total baru,
  // supaya tidak memakai nilai lama yang sudah tidak sesuai setelah qty diubah.
  let uangDiterimaBaru = total;
  let kembalianBaru = 0;
  if (metodeBaru === 'Tunai') {
    // Pertahankan nominal uang fisik yang diterima dari pelanggan jika metode masih Tunai,
    // lalu hitung ulang kembaliannya berdasarkan total baru.
    uangDiterimaBaru = t.metodeBayar === 'Tunai' ? t.uangDiterima : total;
    kembalianBaru = uangDiterimaBaru - total;
    if (kembalianBaru < 0) {
      showToast('Total baru lebih besar dari uang yang diterima. Periksa kembali atau ganti metode bayar.', 'error');
      return;
    }
  }

  const updated = {
    id: t.id,
    tanggal: t.tanggal,
    item: t.item,
    total,
    metodeBayar: metodeBaru,
    uangDiterima: uangDiterimaBaru,
    kembalian: kembalianBaru,
    catatan: document.getElementById('editTrxCatatan').value.trim()
  };

  showLoading('Menyimpan perubahan...');
  try {
    await apiCall('updateTransaksi', { data: updated });
    hideModal('modalEditTrx');
    await loadRiwayat();
    await loadProduk();
    showToast('Transaksi diperbarui', 'success');
  } catch (err) {
    showToast('Gagal memperbarui: ' + err.message, 'error');
  }
  hideLoading();
}

function konfirmasiHapusTransaksi(id) {
  askConfirm('Hapus Transaksi?', 'Stok produk terkait akan dikembalikan otomatis.', async () => {
    showLoading('Menghapus...');
    try {
      await apiCall('hapusTransaksi', { id });
      await loadRiwayat();
      await loadProduk();
      showToast('Transaksi dihapus', 'success');
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    }
    hideLoading();
  });
}

// Membuka kembali tampilan struk untuk transaksi yang sudah tercatat di riwayat,
// supaya bisa dibagikan ulang (misal pelanggan minta ubah pesanan setelah
// transaksi sudah disimpan dan struknya perlu dikirim ulang dengan data terbaru).
function bagikanStrukDariRiwayat(id) {
  const t = STATE.riwayat.find(x => x.id === id);
  if (!t) { showToast('Transaksi tidak ditemukan', 'error'); return; }
  tampilkanStruk(t);
}

// ============ LAPORAN ============

async function loadLaporan() {
  const bulanInput = document.getElementById('filterBulanLaporan').value;
  if (!bulanInput) return;
  const [tahun, bulan] = bulanInput.split('-');

  showLoading('Memuat laporan...');
  try {
    const res = await apiCall('getLaporanBulanan', { bulan: Number(bulan), tahun: Number(tahun) });
    document.getElementById('laporanOmzet').textContent = formatRupiah(res.data.omzet);
    document.getElementById('laporanJumlahTrx').textContent = res.data.jumlahTransaksi;

    const container = document.getElementById('listProdukTerlaris');
    if (res.data.produkTerlaris.length === 0) {
      container.innerHTML = '<p class="empty-state" style="color:#999">Belum ada data.</p>';
    } else {
      container.innerHTML = res.data.produkTerlaris.map(p => `
        <div class="terlaris-item">
          <span>${escapeHtml(p.nama)}</span>
          <span class="terlaris-qty">${p.qty} terjual</span>
        </div>
      `).join('');
    }
  } catch (err) {
    showToast('Gagal memuat laporan: ' + err.message, 'error');
  }
  hideLoading();
}

// ============ PENGATURAN ============

async function loadPengaturan() {
  const res = await apiCall('getPengaturan');
  STATE.pengaturan = res.data;

  document.getElementById('headerNamaToko').textContent = res.data.nama_toko || 'Toko Saya';
  if (res.data.logo_url) {
    setGambarDenganFallback(document.getElementById('headerLogo'), res.data.logo_url);
    simpanLogoTerakhir(res.data.logo_url);
  }

  document.getElementById('setNamaToko').value = res.data.nama_toko || '';
  document.getElementById('setAlamat').value = res.data.alamat || '';
  document.getElementById('setTelepon').value = res.data.telepon || '';
  document.getElementById('setLogoUrl').value = res.data.logo_url || '';
  document.getElementById('setCatatanStruk').value = res.data.catatan_struk || '';
}

async function simpanPengaturan() {
  const data = {
    nama_toko: document.getElementById('setNamaToko').value.trim(),
    alamat: document.getElementById('setAlamat').value.trim(),
    telepon: document.getElementById('setTelepon').value.trim(),
    logo_url: document.getElementById('setLogoUrl').value.trim(),
    catatan_struk: document.getElementById('setCatatanStruk').value.trim()
  };

  showLoading('Menyimpan pengaturan...');
  try {
    await apiCall('simpanPengaturan', { data });
    await loadPengaturan();
    showToast('Pengaturan disimpan', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
  hideLoading();
}

// ============ EVENT LISTENERS ============

// Helper aman: pasang event listener hanya jika elemennya benar-benar ada.
// Ini mencegah satu elemen yang hilang/belum ter-update di HTML membuat
// seluruh listener lain (termasuk navbar) gagal terpasang.
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(event, handler);
  } else {
    console.warn('Elemen dengan id "' + id + '" tidak ditemukan di HTML. Pastikan index.html sudah versi terbaru.');
  }
}

function setupEventListeners() {
  on('btnLogout', 'click', logout);

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => gotoPage(btn.dataset.page));
  });

  on('searchProduk', 'input', e => renderProdukKasir(e.target.value));
  on('searchProdukManage', 'input', e => renderProdukManage(e.target.value));

  on('metodeBayar', 'change', e => {
    const isTunai = e.target.value === 'Tunai';
    document.getElementById('groupUangDiterima').style.display = isTunai ? 'block' : 'none';
    document.getElementById('rowKembalian').style.display = isTunai ? 'flex' : 'none';
    if (!isTunai) document.getElementById('uangDiterima').value = '';
    hitungKembalian();
  });

  on('uangDiterima', 'input', hitungKembalian);
  on('btnBayar', 'click', prosesTransaksi);
  on('btnKosongkan', 'click', () => {
    if (STATE.keranjang.length === 0) return;
    askConfirm('Kosongkan Keranjang?', 'Semua item di keranjang akan dihapus.', kosongkanKeranjang);
  });

  on('btnTambahProduk', 'click', bukaTambahProduk);
  on('btnBatalProduk', 'click', () => hideModal('modalProduk'));
  on('btnSimpanProduk', 'click', simpanProduk);

  on('btnTutupStruk', 'click', () => hideModal('modalStruk'));
  on('btnBagikanStruk', 'click', bagikanStruk);

  on('btnBatalEditTrx', 'click', () => hideModal('modalEditTrx'));
  on('btnSimpanEditTrx', 'click', simpanEditTransaksi);

  on('btnBatalKonfirmasi', 'click', () => hideModal('modalKonfirmasi'));
  on('btnYaKonfirmasi', 'click', () => {
    hideModal('modalKonfirmasi');
    if (confirmCallback) confirmCallback();
  });

  on('filterBulanRiwayat', 'change', loadRiwayat);
  on('filterBulanLaporan', 'change', loadLaporan);

  on('btnSimpanPengaturan', 'click', simpanPengaturan);
}

// ============ START ============
document.addEventListener('DOMContentLoaded', initLoginScreen);
