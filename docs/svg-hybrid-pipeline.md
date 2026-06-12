# SVG Hybrid Pipeline — Ringkasan Implementasi

Tanggal: 2026-06-11

## Latar Belakang

VexFlow tidak bisa merender slur dengan akurat untuk lagu-lagu tertentu (contoh: *An Ukrainian Girl* 0503 yang punya 16 slur). Solusinya: **SVG Hybrid Pipeline** — gunakan SVG yang di-export langsung dari MuseScore sebagai tampilan notasi, bukan VexFlow. Sistem highlight, scrollToBar, dan semua gameplay tetap berjalan tanpa perubahan di `index.html`.

---

## File yang Diubah

### `src/notation-renderer.js`

**Tambahan di constructor:**
```js
this._svgCache = null;  // cached SVG text dari preload()
this._svgEl    = null;  // active inline SVG element (svg mode only)
```

**Method baru: `async preload(songData)`**
- Dipanggil di `song-loader.js` sebelum `render()`
- Jika `songData.meta._svg_file` ada: fetch SVG, simpan di `this._svgCache`
- Jika tidak ada: no-op (langsung resolve)
- Jika fetch gagal: log warning, fallback ke VexFlow

**Method `render()` dimodifikasi:**
- Tidak lagi throw jika `Vex` undefined (dicek setelah branch SVG)
- Jika `this._svgCache` terisi → panggil `_renderSvg()`, return
- Jika tidak → jalur VexFlow seperti semula (backward compatible)

**Method baru: `_renderSvg(songData, containerEl)`**
- Parse cached SVG text ke DOM
- `removeAttribute('width')` + `style="width:100%;height:auto"` agar responsif
- Set `this._canvasW` dan `this._rowH` dari viewBox SVG
- Panggil `_buildSvgNoteMap()`

**Method baru: `_buildSvgNoteMap(svgEl, songData)`**

Algoritma mapping event JSON → elemen SVG:

1. **Parse** semua `<path class="Note">`, ekstrak posisi `tx,ty` dari `transform="matrix(...)"`
2. **Sort** by (system bucket per 1000px, lalu X, lalu Y) → urutan baca kiri-kanan, atas-bawah, treble dulu
3. **Collect** semua event `type === 'note'` dari JSON, sort by (bar, t_ms, treble-first)
4. **Match 1:1** by index (77 events = 77 SVG notes untuk lagu 0503)
5. **Wrap** tiap `<path class="Note">` dalam `<g data-event-id="...">` → CSS class `.nk-active path { fill: ... }` langsung berlaku
6. **Build** `_barElMap` dari event pertama per bar → untuk `scrollToBar()`

Semua API publik (`highlight`, `clearHighlight`, `clearAll`, `dimEvent`, `clearDim`, `markLoopBoundary`, `scrollToBar`) bekerja tanpa perubahan karena tetap mengoperasikan `_noteElMap` dan `_barElMap`.

---

### `src/song-loader.js`

Satu baris `.then(data =>` diubah menjadi `.then(async data =>`, plus tambah satu baris:

```js
.then(async data => {
  await this._renderer.preload(data);   // <-- baru
  this._runtime.load(data);
  this._renderer.render(...);
  ...
})
```

Backward compatible: `preload()` adalah no-op untuk lagu tanpa `_svg_file`.

---

### `songs/0503 An Ukrainian Girl.json`

Tambah satu field di `meta`:
```json
"_svg_file": "songs/svg/0503-ukrainian-girl-1.svg"
```

Setelah batch export, 12 lagu lain juga mendapat field ini.

---

## File Baru

### `songs/svg/` (folder)

Berisi file SVG hasil export MuseScore. Naming convention: `{json-stem-slugified}-1.svg`

Contoh:
- `0503-ukrainian-girl-1.svg`
- `0504-ballon-trip-1.svg`
- `0101-roti-panas-piano-1.svg`
- dst.

---

### `tools/export_svg.py`

Script untuk export SVG dari `.mscz` dan patch `_svg_file` ke song JSON.

**Mode single song:**
```bash
python tools/export_svg.py \
  --mscz "D:/kumpulan musescore files/0504 Ballon Trip.mscz" \
  --json "songs/0504 Ballon Trip.json"
```

**Mode batch (semua lagu sekaligus):**
```bash
python tools/export_svg.py --batch
# Force re-export meski sudah ada _svg_file:
python tools/export_svg.py --batch --overwrite
```

**Fitur utama:**
- Auto-detect format MuseScore: cek ada tidaknya `audiosettings.json` di dalam ZIP `.mscz`
  - MuseScore 3 format → gunakan `D:\Program Files\MuseScore 3\bin\MuseScore3.exe`
  - MuseScore 4 format → gunakan `C:\Program Files\MuseScore 4\bin\MuseScore4.exe`
- Auto-match nama: cari `.mscz` by exact stem, lalu by 4-char number prefix (e.g. `0101`)
- Search paths: root `kumpulan musescore files/` dan subfolder `Yamaha Primary/`
- Skip otomatis lagu yang sudah punya `_svg_file` (kecuali `--overwrite`)
- Multi-page: jika MuseScore buat beberapa halaman (`-1.svg`, `-2.svg`), hanya halaman 1 yang direferensikan

---

### `tools/mxl_to_song.py` (dimodifikasi)

Tambah flag `--mscz` untuk workflow authoring lagu baru:

```bash
python tools/mxl_to_song.py input.mxl songs/output.json \
  --mscz "path/to/song.mscz"
```

Jika `--mscz` diberikan:
1. Auto-detect format MS3/MS4
2. Export SVG ke `songs/svg/`
3. Set `_svg_file` di `song_data["meta"]` sebelum `json.dump`

Sehingga satu perintah menghasilkan JSON lengkap dengan `_svg_file` sudah terisi.

---

## Hasil Batch Export

| Lagu | Format | Status |
|------|--------|--------|
| 0503 An Ukrainian Girl | MS3 | sudah ada (manual) |
| 0504 Ballon Trip | MS3 | OK |
| 0101 Roti Panas-Piano | MS4 | OK |
| 0102 Lihat Pelangi | MS4 | OK |
| 0103 Pembuat Sepatu | MS4 | OK |
| 0105 Sampai Jumpa Lagi | MS4 | OK |
| 0106 Woodpecker | MS4 | OK |
| 0107 Jam Kuku | MS4 | OK |
| 0502 Waltz | MS4 | OK |
| 0609 Small Avelenche | MS4 | OK |
| Minuet Don Giovanni | MS4 | OK |
| minuet in G major | MS4 | OK |
| R1 I'm not the only one | MS4 | OK |
| R1 Wildest Dream | MS4 | OK (2 halaman, p.1 dipakai) |

Lagu tanpa `.mscz` (mis. `simple_test.json`) tetap render via VexFlow.

---

## Catatan Teknis

**Mengapa 77 event = 77 SVG Note?**
Lagu 0503 punya tepat 77 note events (non-rest) di JSON dan 77 `<path class="Note">` di SVG. Kecocokan ini adalah syarat agar mapping 1:1 akurat. Lagu yang tidak cocok akan log warning dan map sebanyak `min(events, notes)`.

**Urutan rendering MuseScore di SVG:**
MuseScore menulis elemen per tipe (semua SlurSegment dulu, semua BarLine, semua Note, dll.), bukan per bar. Algoritma sorting position-based di `_buildSvgNoteMap` memperbaiki ini ke urutan temporal.

**CSS compatibility:**
Rule CSS yang sudah ada (`base-ui.css` baris 860–910) sudah mencakup `.nk-active path { fill: ... !important }`. Karena tiap note sekarang dibungkus `<g class="nk-active">`, CSS langsung berlaku tanpa perubahan stylesheet.

**Backward compatibility:**
- Lagu tanpa `_svg_file` → VexFlow seperti biasa, tidak ada perubahan
- API `renderer.*` di `index.html` tidak berubah sama sekali
- Landscape FAB mode belum dioptimalkan untuk SVG (canvas width/height returns viewBox dimensions)

---

## Workflow Lagu Baru

```
1. Buat/edit lagu di MuseScore 4
2. Export .mxl dari MuseScore (File > Export)
3. Jalankan:
   python tools/mxl_to_song.py input.mxl songs/NamaLagu.json \
       --mscz "path/to/NamaLagu.mscz" \
       --bpm 72 --level beginner
4. Jalankan: python tools/validate_song.py songs/NamaLagu.json
5. Jalankan: python tools/update_song_index.py
```

Langkah 3 otomatis: export SVG + set `_svg_file` + generate JSON + learning path.
