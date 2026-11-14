# SPADAKes (PWA) — Strategi Pengendalian Deviasi Anggaran Kesehatan
Pemerintah Provinsi Banten

Arsitektur: **Frontend** statis (PWA) di GitHub Pages  +  **Backend/Database** Google Apps Script + Google Sheets.

```
spadakes-pwa/
├─ index.html · manifest.webmanifest · sw.js · .nojekyll
├─ css/app.css · js/app.js · js/config.js
├─ icons/            ← ikon PWA & logo Banten
└─ apps-script/      ← Code.gs, Api.gs, Xlsx.gs, Seed.gs, appsscript.json (ditempel ke Apps Script)
```

## 1. Pasang backend (Google Apps Script)
1. Buka <https://script.google.com> → **Proyek baru**. Ganti nama: *SPADAKes API*.
2. Salin isi keempat file di folder `apps-script/` ke proyek (Code.gs, Api.gs, Xlsx.gs, Seed.gs). Buka **Pengaturan proyek → Tampilkan file manifes**, lalu isi `appsscript.json` dengan file yang disertakan.
3. Pilih fungsi **`setup`** → **Jalankan** → setujui izin. Spreadsheet database *SPADAKes - Database* dibuat otomatis di Google Drive Anda, berikut data awal & akun.
4. **Deploy → Deployment baru → Jenis: Aplikasi web**
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
5. Salin **URL Web App** (berakhiran `/exec`).
   Uji: buka URL itu di browser → muncul `{"ok":true,"app":"SPADAKes","status":"online"…}`.

> Setiap mengubah kode Apps Script: **Deploy → Kelola deployment → Edit → Versi baru**. URL tetap sama.

Akun awal (wajib ganti password saat login pertama): `admin` (password awal `Admin@2026`), `pimpinan`, `dinkes`, `pelkes`, `labkesda`, `rsudbanten`, `rsudmalingping`, `rsudlabuan`, `rsudcilograng` — password awal `Spadakes@2026`.

## 2. Hubungkan frontend ke backend
Edit **`js/config.js`**:
```js
window.SPADAKES_CONFIG = { apiUrl: "https://script.google.com/macros/s/XXXXXXXX/exec" };
```
(Alternatif tanpa edit file: di halaman login ketuk **Atur server**, tempel URL; tersimpan di perangkat itu saja.)

## 3. Deploy ke GitHub Pages
1. Buat repository baru (mis. `spadakes`) lalu unggah **seluruh isi folder ini** (kecuali `_dev/` bila ada).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / folder `/ (root)`** → Save.
3. Tunggu ±1 menit; aplikasi tersedia di `https://<username>.github.io/spadakes/`.
4. Semua path bersifat relatif sehingga aman di sub-folder GitHub Pages. HTTPS otomatis (syarat PWA).

## 4. Pasang di perangkat (PWA)
- **Android/Chrome & Windows/Edge**: tombol *Instal aplikasi* di halaman login / menu pengguna, atau ikon instal di address bar.
- **iPhone/iPad**: Safari → Bagikan → *Tambah ke Layar Utama*.

## 5. Memperbarui aplikasi
Setelah mengubah file frontend, naikkan `VERSION` di **sw.js** (mis. `spadakes-v1.0.1`) agar perangkat pengguna mengambil versi baru; pengguna akan melihat pesan *Versi baru tersedia → Muat ulang*.

## Fitur antarmuka
- Tombol **titik tiga (⋯)** membuka/menutup menu samping (di desktop kondisi diingat; di HP/tablet berupa laci geser).
- Kolom isian lebar; di HP struktur anggaran tampil ringkas dan sub kegiatan diisi lewat lembar **Isi** dari bawah layar.
- Filter menciut menjadi ringkasan di HP (*Ubah filter*).
- Sesi login tersimpan 6 jam; data API tidak pernah di-cache; shell aplikasi tetap terbuka saat offline.

## Kecepatan & "Ingat saya"
- Backend menyimpan tabel besar (Struktur, Nilai, dst.) di cache Apps Script yang otomatis diperbarui saat ada penyimpanan; penyimpanan hanya menulis baris yang berubah; Log dibaca 1.500 baris terakhir.
- Frontend membuka aplikasi seketika dari data tersimpan di perangkat lalu menyegarkannya di latar belakang, menyimpan hasil halaman selama 2 menit (tombol muat-ulang ⟳ mengosongkannya), dan menggambar tabel Struktur bertahap.
- **Ingat saya** (centang bawaan): tetap masuk 30 hari di perangkat itu dan username terisi otomatis. Bila tidak dicentang, sesi berakhir saat tab ditutup. Keluar / reset password oleh admin mencabut sesi.
- Setelah memperbarui kode Apps Script: **Deploy → Kelola deployment → Edit → Versi baru**.

## Catatan keamanan
- URL Web App bersifat publik, tetapi semua data dilindungi login (token sesi, hash SHA‑256+salt, kunci setelah 5 kali gagal).
- Jangan menaruh data rahasia di repository GitHub; seluruh data berada di Google Sheets milik akun pemilik deployment.
