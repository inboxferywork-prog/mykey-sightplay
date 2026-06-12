# .mscz Authoring Workflow & Color System Refinement

Tanggal: 2026-06-12

---

## Ringkasan Perubahan

Sesi ini mencakup dua area utama:

1. **Refinement warna** — RH/LH keyboard, bar column, dan note label
2. **Authoring .mscz pipeline** — integrasi import `.mscz` langsung ke Authoring.html via server lokal

---

## Bagian 1 — Color System

### Final Color Scheme

| Elemen | Warna | Hex |
|---|---|---|
| RH keyboard keys | Orange | `#f0a500` |
| LH keyboard keys | Purple | `#a855f7` |
| RH key glow | Orange soft | `rgba(240, 165, 0, 0.65)` |
| LH key glow | Purple soft | `rgba(168, 85, 247, 0.65)` |
| RH note name label | Orange | `#f0a500` |
| LH note name label | **Putih** | `#ffffff` |
| Bar column wash (full bar) | Purple | `#a855f7` |
| Bar column edge | Orange | `#f0a500` |
| Bar column edge glow | Orange | `#f0a500` |
| Tombol Play | Orange | `#f0a500` (dari `--orange`) |

**Prinsip warna:** orange = RH / treble / aksi, purple = LH / bass / area.

LH note label sengaja putih (bukan purple) karena purple pada background hitam kurang terbaca.

### Bug Fix: Theme Override

**Problem:** `--rh-key-color` di `base-ui.css` sudah diset ke `#f0a500` tapi keyboard tetap menampilkan cyan.

**Root cause:** `index.html` memuat dua CSS secara berurutan:
```html
<link rel="stylesheet" href="themes/base-ui.css">
<link rel="stylesheet" href="themes/children-fun.css">   <!-- override! -->
```
`children-fun.css` dimuat setelah `base-ui.css` dan mendefinisikan ulang semua variabel RH/LH di `:root`, sehingga selalu menang.

**Fix:** Update variabel yang sama di `themes/children-fun.css`:
```css
--rh-color:     #f0a500;
--lh-color:     #a855f7;
--rh-key-color: #f0a500;
--lh-key-color: #a855f7;
--rh-glow:      rgba(240, 165, 0, 0.65);
--lh-glow:      rgba(168, 85, 247, 0.65);
```

**Pelajaran:** Setiap kali mengubah warna RH/LH, **kedua file harus diupdate** — `base-ui.css` dan `children-fun.css` — selama kedua file ini selalu dimuat bersamaan.

### Note Label Color

`base-ui.css` baris `~851`:
```css
.nk-kb-note-label.nk-kb-note-label-active-rh { color: var(--rh-key-color); }
.nk-kb-note-label.nk-kb-note-label-active-lh { color: #ffffff; }
```
LH label di-hardcode `#ffffff` karena `var(--lh-key-color)` (`#a855f7`) tidak cukup kontras di atas background hitam keyboard.

---

## Bagian 2 — Persiapan File MuseScore untuk SVG Hybrid Pipeline

### Yang Perlu Diperhatikan di MuseScore

#### Layout Halaman
- Gunakan ukuran halaman yang **konsisten** antar lagu (A4 atau custom).
- Kurangi margin halaman — margin besar = area putih yang harus di-crop = notasi lebih kecil di layar.
- Batasi **3–4 bar per system** untuk lagu level beginner agar notasi tidak terlalu kecil.

#### Jarak Antar System
Pipeline menggunakan threshold **250 SVG unit** untuk mendeteksi batas antar system.
Jarak antar system MuseScore default ~260+ unit — jangan kompres terlalu ekstrem.
Kalau jarak terlalu kecil, pipeline salah membaca jumlah system.

#### Jumlah Note = Jumlah Event JSON
Ini syarat kritis untuk mapping 1:1:
- Jangan ada chord/nada background yang **tidak ada** di `song.json`.
- Kalau terpaksa ada nada dekorasi, jalankan `tools/compute_svg_note_map.py` untuk membuat mapping manual.

#### Judul Lagu
Judul di MuseScore boleh ada — akan di-crop via `_svg_crop` di song JSON.
Kalau tidak ada judul, nilai `_svg_crop.top` bisa lebih kecil.

#### Repeat Signs
Barline ganda (repeat sign) ditangani otomatis — pipeline merge barline yang jaraknya ≤ 50 SVG unit.

### Meta Fields di song.json

| Field | Keterangan |
|---|---|
| `meta._svg_file` | Path relatif ke file SVG, e.g. `"songs/svg/0503-ukrainian-girl-1.svg"` |
| `meta._svg_crop` | `{top, bottom, left, right}` dalam SVG viewBox unit — potong margin dan judul |
| `meta._svg_zoom` | Zoom factor (default `1.0`) — jarang perlu diubah |

`_svg_crop` dihitung otomatis oleh `_compute_svg_crop()` di `mxl_to_song.py` berdasarkan posisi note terluar di SVG.

---

## Bagian 3 — Authoring Server (.mscz Pipeline)

### Arsitektur

```
User upload .mscz ke Authoring.html
    ↓
POST /import-mscz → authoring_server.py
    ├── MuseScore CLI → export .mxl (ke temp dir)
    ├── MuseScore CLI → export .svg (ke songs/svg/)
    └── python mxl_to_song.py → song.json (ke temp dir)
         + patch _svg_file + _svg_crop
    ↓
Return song.json lengkap ke browser
    ↓
Authoring.html buka editor langsung
```

### File yang Ditambahkan/Diubah

| File | Status | Keterangan |
|---|---|---|
| `tools/authoring_server.py` | Baru | Flask server lokal |
| `tools/server_config.json` | Auto-generated | Simpan path MuseScore custom/portable |
| `Authoring.html` | Dimodifikasi | Tombol + panel Import .mscz |

### Setup dan Penggunaan

#### Instalasi (sekali saja)
```bash
pip install flask
# music21 sudah diperlukan oleh mxl_to_song.py
```

#### Menjalankan Server
```bash
python tools/authoring_server.py            # default port 7777
python tools/authoring_server.py --port 8888
```

Server akan menampilkan status MuseScore saat startup:
```
MyKey Authoring Server  —  http://localhost:7777

  MuseScore 4 : C:\Program Files\MuseScore 4\bin\MuseScore4.exe
  MuseScore 3 : D:\Program Files\MuseScore 3\bin\MuseScore3.exe

  Ready. Open Authoring.html in browser.
```

#### Workflow di Authoring.html
1. Klik `🎼 Import .mscz ▾` — panel terbuka
2. Indikator status server:
   - **Titik hijau** — server aktif, MuseScore ditemukan, siap import
   - **Titik kuning** — server aktif tapi MuseScore tidak ditemukan → isi path manual
   - **Titik merah** — server tidak berjalan → jalankan `authoring_server.py`
3. Isi konfigurasi (BPM, Level, Bar/Part, Song ID) — opsional
4. Klik **Browse…** atau drop file `.mscz` langsung ke drop zone
5. Tunggu proses (MuseScore export bisa 5–15 detik)
6. Editor terbuka otomatis dengan song.json lengkap

### Deteksi MuseScore Otomatis

Server memeriksa path berikut secara berurutan:

**MuseScore 4:**
```
C:\Program Files\MuseScore 4\bin\MuseScore4.exe
D:\Program Files\MuseScore 4\bin\MuseScore4.exe
E:\Program Files\MuseScore 4\bin\MuseScore4.exe
```

**MuseScore 3:**
```
C:\Program Files\MuseScore 3\bin\MuseScore3.exe
D:\Program Files\MuseScore 3\bin\MuseScore3.exe
E:\Program Files\MuseScore 3\bin\MuseScore3.exe
C:\Program Files (x86)\MuseScore 3\bin\MuseScore3.exe
```

**MuseScore Portable / Custom Path:**
Simpan via Authoring.html panel (isi path → klik Simpan) atau langsung edit `tools/server_config.json`:
```json
{
  "musescore3_exe": "E:/MuseScore3Portable/MuseScore3.exe",
  "musescore4_exe": ""
}
```
Config ini persist — tidak perlu diisi ulang setiap kali server dijalankan.

### Deteksi Format MS3 vs MS4

Server memeriksa isi ZIP `.mscz`:
- Ada `audiosettings.json` di dalam ZIP → **MS4 format** → pakai `MuseScore4.exe`
- Tidak ada → **MS3 format** → pakai `MuseScore3.exe`
- Kalau versi yang sesuai tidak ditemukan → fallback ke versi lain yang tersedia

---

## Bagian 4 — Workflow Multi-Komputer

### Yang Dibutuhkan di Komputer Lain

| Komponen | Keterangan |
|---|---|
| Project folder | `git clone` atau copy folder |
| Python 3.x | Download dari python.org |
| `pip install flask music21` | Sekali saja |
| MuseScore 3 Portable | Tidak perlu install, taruh di folder manapun |

### Setup Pertama Kali di Komputer Baru

```bash
# 1. Clone project
git clone <repo-url>   # atau copy folder

# 2. Install dependencies
pip install flask music21

# 3. Jalankan server
python tools/authoring_server.py

# 4. Buka Authoring.html di browser
# 5. Klik "🎼 Import .mscz" → isi path MuseScore portable → Simpan
#    Path tersimpan di tools/server_config.json (tidak perlu diisi ulang)
```

### Sinkronisasi Hasil Kerja

Saat import `.mscz` di komputer lain, dua file baru terbentuk:
```
songs/NamaLagu.json          ← download dari Authoring.html
songs/svg/nama-lagu-1.svg    ← tersimpan otomatis oleh server
```

Untuk membawa hasil ke komputer utama:
- **Pakai git:** `git add songs/ && git push` dari komputer lain → `git pull` di komputer utama
- **Manual:** Copy kedua file di atas ke lokasi yang sama di komputer utama

### Ringkasan Perbandingan

| | Komputer Utama | Komputer Lain |
|---|---|---|
| MuseScore 4 (installed) | ✅ | — |
| MuseScore 3 (installed) | ✅ | — |
| MuseScore 3 Portable | ✅ | ✅ |
| Python + flask + music21 | ✅ | install sekali |
| server_config.json | path MS3/MS4 otomatis | isi path portable sekali |
| SVG output folder | `songs/svg/` | `songs/svg/` (sync via git) |

---

## Bagian 5 — Endpoint API Server

### `GET /status`

Response:
```json
{
  "ok": true,
  "musescore4": "C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe",
  "musescore3": null,
  "musescore_found": true,
  "config": {}
}
```

### `POST /config`

Request body (JSON):
```json
{
  "musescore3_exe": "E:/MuseScore3Portable/MuseScore3.exe"
}
```

### `POST /import-mscz`

Request: `multipart/form-data`

| Field | Type | Keterangan |
|---|---|---|
| `mscz` | file | File `.mscz` |
| `bpm` | string | BPM override (kosong = auto dari file) |
| `level` | string | `early_beginner` / `beginner` / `intermediate` / `advanced` |
| `part_size` | string | Bar per segmen (default `4`) |
| `song_id` | string | ID lagu (kosong = auto dari nama file) |

Response: song.json lengkap atau `{"error": "pesan error"}` dengan HTTP 500.

---

## Catatan Teknis

- Server berjalan di `localhost:7777` — tidak terekspos ke jaringan luar
- CORS diaktifkan (`Access-Control-Allow-Origin: *`) agar Authoring.html bisa berkomunikasi dari `file://` maupun `http://localhost`
- MuseScore export timeout: 90 detik per export (SVG dan MXL masing-masing)
- `mxl_to_song.py` timeout: 120 detik
- SVG yang dihasilkan lebih dari 1 halaman: hanya halaman pertama (`slug-1.svg`) yang dipakai
- `_svg_crop` dihitung otomatis dari posisi note terluar di SVG, dengan padding 150px atas, 60px sisi/bawah
