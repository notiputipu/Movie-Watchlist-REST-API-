# FilmLog — Frontend Companion

Frontend FilmLog bertema **Letterboxd / IMDb** untuk menjelajahi film, mengelola
watchlist, mencatat ulasan, dan meminta rekomendasi Gemini.

Frontend memakai Vanilla JavaScript dan Tailwind CSS CDN tanpa build step.
Express menyajikan halaman dan API melalui satu server. Koneksi internet
dibutuhkan untuk aset CDN dan panggilan Gemini.

---

## 🚀 Cara Menjalankan Frontend

### Cara utama: jalankan lewat Express

Dari root proyek:

```powershell
cd API
npm.cmd run dev
```

Buka `http://localhost:8000`. Express menyajikan frontend dan API sekaligus;
Python atau server frontend terpisah tidak diperlukan.

Pilihan server terpisah berikut tetap tersedia jika dibutuhkan. Atur API Base
URL ke alamat backend, misalnya `http://localhost:8000/api`.

### Opsi 1: Menggunakan Python (Tersedia di hampir semua OS)

```bash
cd frontend
python3 -m http.server 3000
```
Buka browser di: `http://localhost:3000`

### Opsi 2: Menggunakan Node / npx

```bash
cd frontend
npx serve .
```

### Opsi 3: VS Code Live Server

Klik kanan `index.html` -> **Open with Live Server**.

---

## ⚙️ Mengarahkan ke Backend Anda
Secara default, frontend memakai origin halaman ditambah `/api`. Saat dibuka
di `http://localhost:8000`, alamat API adalah `http://localhost:8000/api`.

Saat halaman disajikan Express pada port lain, default API mengikuti origin
halaman tersebut. Nilai API URL yang pernah disimpan di browser tetap menjadi
prioritas. Jika memakai server frontend terpisah atau alamat API yang berbeda:

1. Buka web frontend di browser.
2. Klik tombol indikator endpoint di pojok kanan atas (`⚙️ Settings`).
3. Ubah **API Base URL** ke port/URL backend Anda, lalu klik **Save & Reconnect**.

> 💡 **CORS:** Origin Express sendiri sudah diizinkan. Jika memakai server
> frontend terpisah, tambahkan origin tersebut ke `CORS_ORIGINS` di `API/.env`.

---

## 📋 Fitur yang Tersedia di Frontend

1. **🎬 Discover Movies (`GET /api/movies`)**:
   - Menampilkan poster, rating, sutradara, genre.
   - Filter pencarian judul dan filter pill genre.
   - Tombol **Shuffle / Randomize** untuk mengacak tampilan film.
2. **🔍 Detail Film (`GET /api/movies/:id`)**:
   - Modal informasi lengkap (sinopsis, durasi, sutradara, pemeran/cast).
3. **🔐 Autentikasi (`POST /api/auth/register` & `POST /api/auth/login`)**:
   - Login & Register modal.
   - Token JWT disimpan di `localStorage` dan otomatis dikirimkan di header `Authorization: Bearer <token>` pada setiap protected request.
4. **📌 Watchlist (`GET /api/watchlist`, `POST /api/watchlist`, `DELETE /api/watchlist/:movieId`)**:
   - Menambah dan menghapus film dari daftar tontonan pengguna yang sedang login.
5. **⭐ Watched & Reviews (`GET /api/watched`, `POST /api/watched`)**:
   - Mencatat film yang telah ditonton dengan rating bintang (1-5) dan catatan opini/review.
   - Setiap tontonan ulang membuat catatan baru. Riwayat default menampilkan 50
     catatan terbaru; API mendukung query `page` dan `limit`.
   - Setelah catatan disimpan, film dihapus dari watchlist pengguna dan kedua
     daftar dimuat ulang.
6. **🤖 AI Movie Recommendation (`POST /api/movies/recommend`)**:
   - Meminta rekomendasi film berdasarkan deskripsi/mood pengguna.
   - Gemini memilih film dari **20 film awal di database** beserta alasannya.
     Atur `GEMINI_API_KEY` dan model di `API/.env`, lalu restart API.
7. **📡 API Inspector (Drawer di bagian bawah)**:
   - Mencatat setiap HTTP method, URL, status code (200, 401, 500, dll.), dan durasi request secara *real-time* untuk mempermudah debugging backend.

Panduan instalasi lengkap ada di [README proyek](../README.md), dan detail
endpoint serta pengaturan ada di [panduan backend](../API/README.md).
