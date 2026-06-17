// ============================================================
// KASIR PWA - APP LOGIC
// ============================================================

let STATE = {
  produk: [],
  keranjang: [], // { produkId, nama, varian, harga, qty }
  riwayat: [],
  pengaturan: {},
  editingTrxId: null
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

// ============ API CALLS ============

async function apiCall(action, params = {}) {
  const url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', action);
  Object.keys(params).forEach(key => {
    const val = typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key];
    url.searchParams.set(key, val);
  });

  const res = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Terjadi kesalahan');
  return json;
}

// ============ NAVIGATION ============

function gotoPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageName).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${pageName}"]`).classList.add('active');

  const subtitleMap = {
    kasir: 'Kasir',
    produk: 'Kelola Produk',
    riwayat: 'Riwayat Transaksi',
    laporan: 'Laporan Bulanan',
    pengaturan: 'Pengaturan'
  };
  document.getElementById('pageSubtitle').textContent = subtitleMap[pageName] || '';

  if (pageName === 'produk') renderProdukManage();
  if (pageName === 'riwayat') loadRiwayat();
  if (pageName === 'laporan') loadLaporan();
}

// ============ INIT ============

async function init() {
  applyConfigPlaceholders();
  setupEventListeners();

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

function applyConfigPlaceholders() {
  document.getElementById('headerLogo').src = CONFIG.LOGO_URL;
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
  const set = STATE.pengaturan;
  const tgl = new Date(trx.tanggal);
  const tglFormat = tgl.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  const itemRows = trx.item.map(it => `
    <div class="struk-row">
      <span>${escapeHtml(it.nama)}${it.varian ? ' (' + escapeHtml(it.varian) + ')' : ''} x${it.qty}</span>
      <span>${formatRupiah(it.harga * it.qty)}</span>
    </div>
  `).join('');

  document.getElementById('strukContent').innerHTML = `
    ${set.logo_url ? `<img src="${set.logo_url}" class="struk-logo" />` : ''}
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

async function bagikanStruk() {
  const text = document.getElementById('strukContent').innerText;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch (e) {}
  } else {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Struk disalin ke clipboard', 'success');
    } catch (e) {
      showToast('Tidak dapat membagikan struk', 'error');
    }
  }
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
  const updated = {
    id: t.id,
    tanggal: t.tanggal,
    item: t.item,
    total,
    metodeBayar: document.getElementById('editTrxMetode').value,
    uangDiterima: t.metodeBayar === 'Tunai' ? t.uangDiterima : total,
    kembalian: t.kembalian,
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
  if (res.data.logo_url) document.getElementById('headerLogo').src = res.data.logo_url;

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

function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => gotoPage(btn.dataset.page));
  });

  document.getElementById('searchProduk').addEventListener('input', e => renderProdukKasir(e.target.value));
  document.getElementById('searchProdukManage').addEventListener('input', e => renderProdukManage(e.target.value));

  document.getElementById('metodeBayar').addEventListener('change', e => {
    const isTunai = e.target.value === 'Tunai';
    document.getElementById('groupUangDiterima').style.display = isTunai ? 'block' : 'none';
    document.getElementById('rowKembalian').style.display = isTunai ? 'flex' : 'none';
    if (!isTunai) document.getElementById('uangDiterima').value = '';
    hitungKembalian();
  });

  document.getElementById('uangDiterima').addEventListener('input', hitungKembalian);
  document.getElementById('btnBayar').addEventListener('click', prosesTransaksi);
  document.getElementById('btnKosongkan').addEventListener('click', () => {
    if (STATE.keranjang.length === 0) return;
    askConfirm('Kosongkan Keranjang?', 'Semua item di keranjang akan dihapus.', kosongkanKeranjang);
  });

  document.getElementById('btnTambahProduk').addEventListener('click', bukaTambahProduk);
  document.getElementById('btnBatalProduk').addEventListener('click', () => hideModal('modalProduk'));
  document.getElementById('btnSimpanProduk').addEventListener('click', simpanProduk);

  document.getElementById('btnTutupStruk').addEventListener('click', () => hideModal('modalStruk'));
  document.getElementById('btnBagikanStruk').addEventListener('click', bagikanStruk);

  document.getElementById('btnBatalEditTrx').addEventListener('click', () => hideModal('modalEditTrx'));
  document.getElementById('btnSimpanEditTrx').addEventListener('click', simpanEditTransaksi);

  document.getElementById('btnBatalKonfirmasi').addEventListener('click', () => hideModal('modalKonfirmasi'));
  document.getElementById('btnYaKonfirmasi').addEventListener('click', () => {
    hideModal('modalKonfirmasi');
    if (confirmCallback) confirmCallback();
  });

  document.getElementById('filterBulanRiwayat').addEventListener('change', loadRiwayat);
  document.getElementById('filterBulanLaporan').addEventListener('change', loadLaporan);

  document.getElementById('btnSimpanPengaturan').addEventListener('click', simpanPengaturan);
}

// ============ START ============
document.addEventListener('DOMContentLoaded', init);
