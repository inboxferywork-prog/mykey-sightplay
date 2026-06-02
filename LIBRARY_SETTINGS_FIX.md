# Library Settings Persistence Fix

## Masalah yang Diperbaiki

**Sebelumnya:** Ketika user mengubah library settings (Listed/Hidden, Collection, Tags) di authoring.html dan klik "Save & Index", perubahan tidak tersimpan di song.json. Jadi saat membuka file kembali, library settings kembali ke default.

**Sekarang:** Library settings tersimpan di `song.json.library` field, sehingga persistent ketika membuka kembali file.

---

## Perubahan yang Dilakukan

### 1. **authoring.html** — 3 Fungsi Diupdate

#### A. `_applyMetaEdits()` — Sekarang Simpan Library Settings
```javascript
// Sebelumnya: HANYA simpan title, composer, level, bpm, dll
// Sekarang: JUGA simpan:
if (!_songData.library) _songData.library = {};
_songData.library.listed       = _uiListed;
_songData.library.collectionId = _uiCollectionId || null;
_songData.library.tags         = _uiTags;
```

#### B. `_loadSongData()` — Sekarang Restore Library Settings
```javascript
// Sebelumnya: RESET library card ke default (listed: true)
// Sekarang: RESTORE dari song.json.library jika ada:
const libSettings = data.library || {};
_setListed(libSettings.listed !== false);
_uiCollectionId = libSettings.collectionId || null;
_uiTags         = Array.isArray(libSettings.tags) ? libSettings.tags : [];
```

#### C. `_buildSongEntry()` — Prioritas Data yang Lebih Baik
```javascript
// Sebelumnya: HANYA baca dari _uiListed variable
// Sekarang: PRIORITAS:
//   1. song.json.library (data tersimpan di file)
//   2. _uiListed variable (state di UI)
const listed = lib.listed !== undefined ? lib.listed : _uiListed;
```

### 2. **update_song_index.py** — Updated Priority Logic

```python
# Sebelumnya: HANYA preserve dari existing_entry (index.json lama)
# Sekarang: PRIORITAS 3-level:

# Priority 1: Read dari song.json.library (authoring UI updates)
if 'listed' in library:
    listed = bool(library['listed'])

# Priority 2: Fallback ke existing_entry (backward compatibility)
elif 'listed' in existing_entry:
    listed = bool(existing_entry['listed'])

# Priority 3: Apply defaults (new file)
else:
    listed = not _is_fixture(path.stem)
```

---

## Struktur song.json yang Baru

```json
{
  "meta": {
    "title": "Pelangi",
    "composer": "...",
    "level": "early_beginner",
    ...
  },
  "library": {
    "listed": true,
    "collectionId": null,
    "tags": []
  },
  "parts": [...],
  "score": {...},
  "learning_segments": [...]
}
```

---

## Workflow Baru

```
1. Edit file di authoring.html
   ↓
2. Ubah library settings:
   - Listed → Hidden
   - Pilih collection
   - Tambah tags
   ↓
3. Klik "💾 Save & Index"
   ↓
4. library settings TERSIMPAN ke song.json ✅
   ↓
5. Buka file kembali
   ↓
6. Library card RESTORE dengan settings yang tepat ✅
   ↓
7. Jalankan update-index.cmd
   ↓
8. index.json di-regenerate dengan library settings yang benar ✅
```

---

## Backward Compatibility

✅ **Existing files tanpa library field tetap work:**
- Script akan membaca dari existing_entry (index.json lama)
- Atau apply defaults jika pertama kali
- File tidak perlu diupdate manual

---

## Testing

Setelah update, coba:

1. **Edit di authoring.html:**
   - Load file: `0102 Lihat Pelangi.json`
   - Ubah: Listed → Hidden
   - Tambah: Collection atau tags
   - Klik: "Save & Index"

2. **Verify perubahan tersimpan:**
   - Close file di authoring.html
   - Reopen file
   - Library card harus restore dengan settings tadi

3. **Verify index.json updated:**
   ```bash
   python tools/update-index.cmd
   # OR
   python tools/update_song_index.py
   ```
   - Check `songs/index.json` — `listed` & `collectionId` harus match song.json

---

## FAQ

**Q: Apakah ini backward compatible?**  
A: Ya! Existing files tanpa library field tetap work, script akan fallback ke existing_entry atau apply defaults.

**Q: File lama perlu diupdate?**  
A: Tidak! Saat pertama kali save dengan authoring.html baru, library field akan dibuat otomatis.

**Q: Apakah index.json format berubah?**  
A: Tidak! index.json tetap sama format. Hanya source data yang berubah (sekarang bisa dari song.json.library).

**Q: Apa yang terjadi jika conflict antara song.json.library dan index.json lama?**  
A: song.json.library **win** (priority 1). Index.json lama hanya fallback jika song.json tidak punya library field.
