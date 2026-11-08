# FilmLog — Frontend Companion

Aplikasi frontend sederhana bertema **Letterboxd / IMDb** yang dirancang sebagai antarmuka pengujian bagi peserta penugasan Backend GDGoC.

Frontend ini dibuat **Zero-Build & Standalone** (menggunakan Tailwind CSS CDN dan Vanilla Modern JS). Peserta **tidak perlu** menginstall `npm` dependencies apa pun untuk menjalankannya.

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

Jika backend Anda berjalan di port lain (misal `:3000`, `:5000`, atau live URL Render):
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
4. **📌 Watchlist (`GET /api/watchlist`, `POST /api/watchlist`, `DELETE /api/watchlist/:id`)**:
   - Menambah dan menghapus film dari daftar tontonan pengguna yang sedang login.
5. **⭐ Watched & Reviews (`GET /api/watched`, `POST /api/watched`)**:
   - Mencatat film yang telah ditonton dengan rating bintang (1-5) dan catatan opini/review.
6. **🤖 AI Movie Recommendation (`POST /api/movies/recommend`)**:
   - Meminta rekomendasi film berdasarkan deskripsi/mood pengguna.
   - Backend harus memanfaatkan Gemini API untuk memilihkan film **yang tersedia di database lokal** beserta alasan logisnya.
7. **📡 API Inspector (Drawer di bagian bawah)**:
   - Mencatat setiap HTTP method, URL, status code (200, 401, 500, dll.), dan durasi request secara *real-time* untuk mempermudah debugging backend.
