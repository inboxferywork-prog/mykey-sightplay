# MyKey Music Labs — Master Project Specification
## Sight Playing Education Platform

> Dokumen ini adalah single source of truth untuk seluruh project.
> Gabungan dari: sesi perencanaan Fay + Claude, SPEC.md, ENGINE_BOUNDARIES.md,
> MASTER_PROJECT_DIRECTION.md, INDUSTRY_LOGIC_AND_PRODUCT_RULES.md,
> CLAUDE_CODE_BOOTSTRAP.md.
>
> Paste dokumen ini sebagai context pertama saat membuka Claude Code.
> Semua keputusan di sini sudah final kecuali disebutkan sebaliknya.

---

# BAGIAN 1 — IDENTITAS PRODUK

## 1.1 Apa MyKey Music Labs

MyKey Music Labs adalah:

**browser-based interactive sight playing education platform**

Bukan:
- rhythm game arcade
- Synthesia clone
- falling-note simulator
- performance simulator

Platform ini dirancang untuk:
- membantu murid piano membaca notasi nyata
- melatih sight playing secara bertahap
- mendukung pembelajaran guru piano
- menjadi companion latihan mandiri
- scalable dari beginner sampai advanced repertoire

Inspirasi terbaik:
- **Simply Piano** → onboarding & accessibility
- **Piano Marvel** → sight reading structure
- **Deep Piano** → audio intelligence
- **Noteflight** → browser music workflow
- **MuseScore** → notation ecosystem
- **Sibelius / Finale / Dorico** → notation correctness

## 1.2 Brand
- **Platform:** MyKey Music Labs
- **Developer:** ariyadigital / Line Space Games

## 1.3 Platform Strategy
- Mulai sebagai **website** (Netflix-style song picker), local test dulu
- Opsi **download native app** (Electron / Tauri) untuk audio detection lebih baik
- Website: Netlify / GitHub Pages (free tier)

---

# BAGIAN 2 — FILOSOFI INTI (NON-NEGOTIABLE)

## 2.1 Educational Clarity Wins

Jika ada konflik antara **"visual cool"** vs **"educational clarity"**:
→ **educational clarity harus menang.**

## 2.2 Timeline Integrity Wins

Jika ada konflik antara **"quick hack"** vs **"timeline integrity"**:
→ **timeline integrity harus menang.**

## 2.3 Stable Tempo Over Performance Tempo

Aplikasi ini adalah **reading trainer**, bukan performance simulator.
Beginner lebih membutuhkan tempo stabil daripada tempo cepat.

## 2.4 Timeline Is the Single Source of Truth

Semua subsystem wajib membaca timing dari satu timeline yang sama.

Tidak boleh ada:
- frame timing terpisah
- pixel timing
- renderer timing
- gameplay timing berbeda
- audio-driven timing

Semua harus mengikuti `song.timeline[]` dan `duration_ms` sebagai authoritative timing.

## 2.5 User Mengikuti Timeline

Timeline adalah kontrol utama. User yang mengikuti progress bar — bukan sebaliknya.
Jika user terlambat = tidak ada score. Timeline tidak menunggu user.

---

# BAGIAN 3 — ARSITEKTUR ENGINE

## 3.1 Golden Rule

**One Engine = One Responsibility**

Jika satu engine mulai mengetahui terlalu banyak, mengontrol terlalu banyak,
atau menyimpan terlalu banyak state — architecture mulai drift.

## 3.2 File Structure Engine

```
sightplay/
├── tools/
│   ├── mxl_to_song.py           ← generator MXL → JSON (offline, Python + music21)
│   └── validate_song.py         ← validator song.json (offline, Python)
├── songs/
│   ├── thompson_c_position.json
│   └── ...
├── audio/
│   ├── bg_cposition.mp3
│   ├── cposition_full.mp3
│   └── cposition_part1.mp3
├── src/
│   ├── runtime-engine.js        ← timeline authority (Layer 1)
│   ├── notation-renderer.js     ← VexFlow SVG rendering (Layer 2, Layer 3 frozen)
│   ├── learning-state.js        ← guided learning presentation state (Session 39)
│   ├── pitch-engine.js          ← microphone + pitch detection (Layer 3, future)
│   ├── gameplay-engine.js       ← scoring + educational logic (Layer 4, future)
│   └── hint-engine.js           ← hint animations + overlays (future)
├── shared/
│   └── utils.js                 ← helper generic yang benar-benar shared
├── index.html                   ← ui-shell, song picker, wires semua engine
└── SPEC.md                      ← dokumen ini
```

## 3.3 Layered Architecture (Mandatory)

```
song.json (timeline event structure)
         ↓
  runtime-engine.js          ← Layer 1: satu-satunya timeline authority
         ↓
  [event callbacks — satu bahasa, satu arah]
         ↓
  ┌──────────────┬──────────────┬──────────────┐
  │ notation-    │ gameplay-    │ hint-        │
  │ renderer.js  │ engine.js    │ engine.js    │
  │ (Layer 2)    │ (Layer 4)    │              │
  └──────────────┴──────────────┴──────────────┘
         ↓
  pitch-engine.js            ← Layer 3: input only, tidak ada timeline authority
         ↓
  UI feedback (index.html)
```

**Satu bahasa, satu arah:**
- Runtime berbicara duluan via events
- Engine lain mendengarkan — tidak pernah membalik arah
- Semua engine membaca event dari struktur yang sama (timeline event structure)
- Tidak ada engine yang berjalan dengan timing sendiri

## 3.4 Tanggung Jawab Setiap Engine

### `runtime-engine.js` — Timeline Authority
**Boleh tahu:** song timeline, event metadata, timing state
**Tidak boleh tahu:** SVG, DOM, VexFlow, scoring UI, audio waveform, hint animation

**Tanggung jawab:**
- timeline playback
- playhead progression
- duration tracking
- event enter/exit
- pause/resume/seek
- loop handling
- event state machine

**Output — hanya events:**
```javascript
onEventEnter(event)      // dipanggil saat event mulai
onEventExit(event)       // dipanggil saat event selesai
onTimelineUpdate(time)   // dipanggil setiap tick
```

### `notation-renderer.js` — Visual Layer
**Boleh tahu:** notation structure, event IDs, visual mapping
**Tidak boleh tahu:** scoring, gameplay logic, timeline mutation, audio state, timing authority

**Tanggung jawab:**
- render notation via VexFlow SVG
- highlight active note
- scroll viewport
- visual note state

**Interface:**
```javascript
render(songData, containerEl)
highlightNote(eventId, style)   // style: 'explore'|'active'|'question'
clearHighlight()
scrollToBar(barN)
setZoom(scale)
```

**Penting:** Renderer adalah visual layer saja.
Renderer tidak boleh mengontrol game flow, timing, atau menentukan note correctness.
Renderer harus replaceable (VexFlow SVG → Canvas → WebGL → native) tanpa
mengubah engine lain.

### `pitch-engine.js` — Input Judge
**Boleh tahu:** audio buffer, split frequency, pitch estimation
**Tidak boleh tahu:** timeline progression, scoring, lesson structure, renderer state

**Tanggung jawab:**
- microphone input
- McLeod NSDF pitch detection
- dB threshold gate
- split frequency routing (treble/bass)
- chord detection window

**Output — hanya emits:**
```javascript
onNote(callback)   // → { note, clef, time, confidence, db }
```

Pitch engine tidak boleh move timeline atau auto-advance gameplay.

### `gameplay-engine.js` — Educational Logic
**Boleh tahu:** current runtime event, detected notes, score state
**Tidak boleh tahu:** SVG structure, waveform internals, renderer implementation

**Tanggung jawab:**
- scoring (perfect/good/late/miss)
- streak tracking
- educational feedback
- timing judgement
- grace window system
- retry logic
- hint penalty

**Penting:** Gameplay evaluates. Gameplay does NOT render.

### `hint-engine.js` — Educational Overlays
**Boleh tahu:** current event, hint settings, practice mode
**Tidak boleh tahu:** scoring authority, runtime mutation, renderer internals

**Tanggung jawab:**
- note name overlay
- keyboard highlight
- fingering hints
- auto-hint timer
- arrow animasi notasi → tuts
- wrong flash
- narrowing hint

**Interface:**
```javascript
showNoteName(note, targetEl)
showKeyboardHighlight(notes, clef)
showArrow(fromEl, toEl)
showFingering(finger, targetEl)
flashWrong(keyEl)
showNarrowing(candidates)
showQuestionMark(noteEl)
clearAll()
```

### `index.html` (ui-shell) — Orchestration Layer
**Boleh tahu:** semua engine interface (untuk wire up)
**Tidak boleh tahu:** runtime internals, notation layout internals, audio internals

**Tanggung jawab:**
- menus, buttons, settings
- layout
- song picker
- screen transitions
- wiring semua engine

## 3.5 State Ownership (Single Owner Rule)

Setiap state hanya boleh punya satu owner:

| State | Owner |
|---|---|
| `currentEvent` | runtime-engine |
| `playhead` | runtime-engine |
| `score` | gameplay-engine |
| `streak` | gameplay-engine |
| `detectedPitch` | pitch-engine |
| `activeHint` | hint-engine |
| `menuState` | ui-shell (index.html) |
| `notationLayout` | notation-renderer |
| `learningPresentationState` | learning-state.js — clef filter, hand-color mode, overlay rules |
| `keyboardHighlightState` | learning-state.js — current keys to be lit on future keyboard |

Tidak boleh 2 engine mengontrol state yang sama.

## 3.6 Communication Rule

**Gunakan:** events, callbacks, message passing
**Hindari:** direct mutation antar engine, shared mutable globals, hidden state changes

Semua komunikasi:
- satu bahasa: timeline event structure
- satu arah: runtime → engine lain
- tidak ada engine yang memanggil balik ke runtime untuk mengubah state

Detail implementasi komunikasi (direct callback vs EventEmitter)
diputuskan saat coding — yang tidak boleh berubah adalah prinsip di atas.

## 3.7 No Cross-Engine Helpers

Dilarang:
- renderer-helper dipakai gameplay
- audio-helper dipakai runtime
- UI-helper dipakai notation internals

Jika helper benar-benar generic → taruh di `shared/utils.js`, tetap kecil dan jelas.

---

# BAGIAN 4 — DATA CONTRACT: SONG.JSON

## 4.1 Timeline Event Structure

Format `song.json` adalah satu-satunya data contract yang dipakai semua engine.
Ini adalah "satu bahasa yang sama" yang dimaksud di seluruh dokumen ini.

```json
{
  "meta": {
    "id": "thompson_lesson1_cposition",
    "title": "C Position March",
    "composer": "John Thompson",
    "level": "early_beginner",
    "bpm": 72,
    "time_signature": [4, 4],
    "key_signature": "C",
    "hand_mode": "rh_only",
    "active_clefs": ["treble"],
    "freq_split_hz": 261.63,
    "part_size_bars": 4,
    "background_music": {
      "src": "audio/bg_cposition.mp3",
      "volume": 0.3,
      "loop": true
    },
    "example_audio": {
      "full": "audio/cposition_full.mp3",
      "parts": [
        "audio/cposition_part1.mp3",
        "audio/cposition_part2.mp3"
      ]
    },
    "hint_config": {
      "auto_hint_timeout_ms": 7000,
      "auto_play_timeout_ms": 12000,
      "show_note_name_always": true,
      "show_keyboard_highlight": true,
      "show_fingering_always": true,
      "hint_penalty": {
        "auto_highlight": -3,
        "auto_play": -5,
        "tap_note": -5,
        "question_mark": -8,
        "wrong_2x_narrowing": -5
      }
    }
  },

  "parts": [
    {
      "part_id": "part_1",
      "label": "Part 1",
      "bars": [1, 2, 3, 4],
      "has_pickup": false,
      "example_audio": "audio/cposition_part1.mp3"
    }
  ],

  "score": {
    "bars": [
      {
        "bar": 1,
        "beats": [
          {
            "id": "ev_000001",
            "bar": 1,
            "beat": 1,
            "clef": "treble",
            "type": "note",
            "notes": ["C4"],
            "duration": "q",
            "duration_ms": 833,
            "t_ms": 0,
            "finger": 1,
            "tie_start": false,
            "tie_stop": false,
            "tolerance_cents": 50
          },
          {
            "id": "ev_000002",
            "bar": 1,
            "beat": 2,
            "clef": "treble",
            "type": "chord",
            "notes": ["E4", "G4"],
            "duration": "h",
            "duration_ms": 1666,
            "t_ms": 833,
            "tie_start": false,
            "tie_stop": false,
            "tolerance_cents": 50
          },
          {
            "id": "ev_000003",
            "bar": 1,
            "beat": 4,
            "clef": "treble",
            "type": "rest",
            "duration": "q",
            "duration_ms": 833,
            "t_ms": 2499
          },
          {
            "id": "ev_000004",
            "bar": 1,
            "beat": 1,
            "clef": "bass",
            "type": "note",
            "notes": ["C3"],
            "duration": "q",
            "duration_ms": 833,
            "t_ms": 0,
            "pair_with_id": "ev_000001",
            "tie_start": false,
            "tie_stop": false,
            "tolerance_cents": 50
          }
        ]
      }
    ]
  },

  "scoring": {
    "perfect_window_ms": 150,
    "good_window_ms": 400,
    "points_per_note": {
      "perfect": 10,
      "good": 6,
      "late": 3,
      "miss": 0
    },
    "timing_bonus": true,
    "streak_bonus": { "every": 5, "bonus": 10 }
  }
}
```

## 4.2 Permanent Event IDs (Mandatory)

Setiap event wajib memiliki ID permanen:
```json
{ "id": "ev_000123" }
```

**Jangan gunakan:** array index, slot index, render order sebagai identifier.
Array index akan rusak saat score diedit.

ID permanen dibutuhkan untuk:
- replay
- analytics
- adaptive learning
- teacher report
- mistake tracking
- save progress
- loop practice

## 4.3 Field Reference

| Field | Keterangan |
|---|---|
| `id` | Permanent event ID format `ev_XXXXXX` — wajib ada, tidak boleh berubah |
| `t_ms` | Absolute timestamp dari awal lagu (ms) — dihitung generator via music21 `.flat` offset |
| `duration_ms` | Durasi event dalam ms — dihitung generator. Engine tidak hitung ulang. |
| `type` | `"note"` / `"chord"` / `"rest"` |
| `notes[]` | Format: `"C4"`, `"F#3"`, `"Bb5"`, `"##"` / `"bb"` untuk double accidental |
| `clef` | `"treble"` / `"bass"` — dideteksi otomatis dari part oleh generator |
| `bar` | Nomor bar, sequential dari 1 |
| `finger` | Nomor jari 1–5, dari fingering annotation di MuseScore (bisa `null`) |
| `tie_start` | `true` jika note ini awal dari tie |
| `tie_stop` | `true` jika note ini akhir dari tie |
| `pair_with_id` | Mode `both` — ID event di clef lain yang dimainkan bersamaan (t_ms sama) |
| `has_pickup` | Di level part — pickup beat tidak dipisah dari part pertamanya |
| `freq_split_hz` | Di meta — split point mic untuk 2 tangan (default C4 = 261.63 Hz) |
| `tolerance_cents` | Bisa berbeda per note (default 50) |
| `part_size_bars` | Di meta — jumlah bar per part: 2 / 4 / 8 |

---

# BAGIAN 5 — LEARNING SYSTEM

## 5.1 Level System

| Level | Deskripsi | Contoh repertoar |
|---|---|---|
| `early_beginner` | Belum tahu posisi nada | John Thompson Book 1, Beyer Op.101 awal |
| `beginner` | Kenal treble + bass, 1 tangan bergantian | Thompson Book 2, Bartók Mikrokosmos Vol.1 |
| `intermediate` | 2 tangan bersamaan, durasi penting | Sonatinas, Bach Minuets |
| `advanced` *(future)* | Lagu kompleks | Chopin Nocturne Op. 9 |

## 5.2 Part System

- Lagu dibagi menjadi **parts** oleh generator
- Pembagian per 2, 4, atau 8 bar (dikonfigurasi di `meta.part_size_bars`)
- Generator aware terhadap **pickup beat** — tidak dipisah dari bar pertama part-nya
- Minimal **⭐⭐ di Stage 2** untuk unlock part berikutnya
- Part yang sudah unlock bisa diulang kapan saja

## 5.3 3-Stage System Per Part

Setiap part dilalui dalam 3 stage. Urutan mencerminkan cara guru piano mengajar:
tonton dan kenali → latihan tanpa tekanan → main dengan tempo.

```
STAGE 1 — Explore
App yang memainkan · User menonton · Orange highlight bergerak
Tidak ada scoring · Bisa di-skip
         ↓ selesai atau skip
STAGE 2 — Recognize
Tanpa timer · User tekan tuts yang benar · Hint 1x per note
Scoring aktif · Unlock next part jika ≥ ⭐⭐
         ↓ ≥ ⭐⭐
STAGE 3 — Sight Play
Timer berjalan · User pilih tempo · Progress bar aktif
Timeline kontrol utama · Full scoring
         ↓ semua part selesai
FULL SONG RUN-THROUGH
Scrolling tanpa henti · Tidak ada scoring · User ikuti saja
```

---

## 5.4 Stage 1 — Explore

**Tujuan:** User menonton dan mendengar lagu dimainkan dari awal sampai akhir per part
sebelum diminta memainkan apapun.

**Mekanisme:**
- User tekan **Start** → app memulai playback otomatis mengikuti timeline event
- **Note aktif di notasi:** highlight **orange**, bergerak mengikuti timeline
  - Bisa bergerak bersamaan di treble + bass (mode 2 tangan)
  - Bisa berpindah antara treble dan bass sesuai timeline
- **Tuts aktif di keyboard:** highlight **orange** bersamaan dengan note di notasi
  - Chord: semua tuts chord highlight bersamaan
  - Mengikuti durasi note dan rest
- **Audio contoh MP3** diputar bersamaan:
  - Early beginner: **auto-play** saat Stage 1 dimulai
  - Beginner ke atas: tombol **"Dengar Contoh"** opsional
- Tidak ada interaksi yang dituntut dari user — murni tonton dan dengar
- Tidak ada scoring, tidak ada star rating
- **Skip:** user bisa tap Skip jika sudah kenal → langsung ke Stage 2

---

## 5.5 Stage 2 — Recognize

**Tujuan:** User belajar mengenali dan menemukan posisi note yang benar di tuts,
tanpa tekanan waktu. Fokus pada akurasi posisi, bukan timing.

**Mekanisme:**
- App tampilkan **satu note/chord aktif** dengan indikator:
  - Note di notasi: warna **orange** + tanda **"?"**
  - Chord: tanda "?" di samping chord
  - Tuts: **tidak di-highlight** — user harus mencari sendiri
- User tekan tuts yang benar → lanjut ke note berikutnya
- Tidak ada timer, tidak ada progress bar bergerak
- Tap notasi → dengar suara (penalty -5)

**Hint Stage 2 — maksimal 1x per note:**
- **7 detik:** tuts highlight orange + note name (penalty -3)
- **12 detik:** auto-play suara + arrow animasi notasi → tuts (penalty -5)
- Tombol **"?"** tersedia — menggunakan jatah 1x hint sekaligus (penalty -8)
- Setelah hint muncul: tidak ada hint lagi untuk note itu
- Salah 2x berturut: narrowing hint — 2–3 tuts kandidat kuning (penalty -5)
- Salah (immediate): flash merah di tuts + suara "wrong" + tidak ada penalty tambahan

**Scoring Stage 2:**
- Benar sebelum hint: 10 poin
- Benar setelah hint pertama (highlight): 6 poin
- Benar setelah hint kedua (auto-play): 3 poin
- Miss: 0 poin

**Star Rating Stage 2:**
- ⭐ = menyelesaikan semua note part
- ⭐⭐ = ≥ 2/3 total note benar sebelum atau tanpa hint kedua → **unlock next part**
- ⭐⭐⭐ = ≥ 90% note benar sebelum hint apapun muncul

**Retry:** unlimited

---

## 5.6 Stage 3 — Sight Play

**Tujuan:** True sight playing — membaca notasi dan memainkan sesuai tempo.
Timeline adalah kontrol utama. User yang mengikuti.

**Mekanisme:**
- **Progress bar** berjalan per note sesuai `duration_ms` dari timeline event
- Saat progress bar habis → pindah ke note berikutnya sesuai timeline
- User terlambat = miss, tidak ada score untuk note tersebut
- Timeline tidak menunggu user

**Pilihan Tempo — 4 tombol besar, selalu tersedia semua:**

| Tombol | Tampilan | Istilah Musik | BPM |
|---|---|---|---|
| 🐌 | **Easy** *(Largo)* | Largo | ~30 bpm |
| 🐢 | **Grave** | Grave | 40–50 bpm |
| 🚶 | **Andante** | Andante | 70–80 bpm *(default)* |
| 🚴 | **Moderato** | Moderato | 95–110 bpm |

> Semua pilihan selalu tersedia tanpa exception — termasuk Easy/Largo meski
> tempo asli lagu sudah lambat. Banyak siswa di lapangan masih memerlukan
> tempo sangat stabil meski sangat pelan.
> Bentuk tombol besar, bukan slider.
> "Easy (Largo)" — "Easy" intuitif, "(Largo)" mengajarkan istilah musik.

**Hint Stage 3:**
- Wrong answer: flash merah di tuts (immediate, tanpa penalty) + progress bar pause sebentar
- Auto-hint 7 detik: highlight tuts + note name (penalty -3)
- Tidak ada tombol "?" — user seharusnya sudah lebih mandiri
- Tap notasi untuk dengar suara: tersedia (penalty -5)

**Full Scoring:** Perfect / Good / Late / Miss + timing bonus + streak bonus

**Star Rating Stage 3:**
- ⭐ = menyelesaikan part
- ⭐⭐ = akurasi ≥ 70% note benar dalam timing window
- ⭐⭐⭐ = akurasi ≥ 90% + timing dalam good window

---

## 5.7 Full Song Run-Through Mode

**Trigger:** Semua part ≥ ⭐⭐ di Stage 2

**Mode:**
- Scrolling notasi otomatis dari awal sampai akhir tanpa henti
- Scrolling cursor mengikuti timeline event
- Treble + bass bersamaan jika lagu 2 tangan
- Background music MP3 diputar bersamaan
- Tidak ada scoring, tidak ada hint, tidak ada interupsi
- User bermain mengikuti tampilan — atau hanya menonton saja
- Bukan game mode — murni run-through

---

# BAGIAN 6 — SCORING SYSTEM

## 6.1 Per Note — Stage 3

| Kategori | Kondisi | Poin |
|---|---|---|
| Perfect | Dalam 150ms dari progress bar | 10 |
| Good | Dalam 400ms | 6 |
| Late | Lewat window, sebelum note berikutnya | 3 |
| Miss | Progress bar habis / tidak dimainkan | 0 |

## 6.2 Grace System untuk Beginner

Tambahkan pre-hit tolerance dan recovery window:
- User salah pencet → memperbaiki dalam 300–400ms → tetap bisa dianggap Good
- Tujuan: lebih manusiawi, tidak menghukum beginner terlalu keras
- App tidak boleh terasa seperti "mesin penghukum"

## 6.3 Bonus & Penalty

- **Timing bonus:** note dimainkan tepat saat progress bar mulai
- **Streak bonus:** setiap 5 note benar berturut = +10
- **Hint penalties:** lihat Bagian 7 (Hint System)
- **Wrong answer:** progress bar **pause** (bukan reset) — lebih forgiving

## 6.4 Scoring Philosophy

Scoring harus terasa:
- encouraging
- educational
- readable

Bukan:
- terlalu menghukum
- terlalu kompetitif
- arcade-style

---

# BAGIAN 7 — HINT SYSTEM

## 7.1 Trigger & Type Lengkap

### ① Auto-hint (timeout) — Stage 2 dan 3
| Delay | Aksi | Penalty |
|---|---|---|
| 7 detik | Highlight tuts + note name di notasi | -3 |
| 12 detik | Auto-play suara + arrow animasi notasi → tuts | -5 |

> Stage 2: setiap note hanya 1x hint total.
> Stage 3: auto-hint tetap ada tapi penalty terasa karena timeline terus berjalan.

### ② Wrong Answer Feedback
| Kondisi | Aksi | Penalty |
|---|---|---|
| Salah immediate | Flash merah di tuts + suara "wrong" + progress bar pause | 0 |
| Salah 2x berturut (Stage 2) | Narrowing: 2–3 tuts kandidat kuning + note name | -5 |

### ③ User-Initiated — Stage 2 saja
| Aksi | Hint | Penalty |
|---|---|---|
| Tap note di notasi | Play suara + note name + highlight tuts + fingering | -5 |
| Tap tombol "?" | Semua note aktif di tuts + play + arrow | -8 |

### ④ Always-Visible per Level (tanpa penalty)
| Level | Always-on |
|---|---|
| `early_beginner` | Note name selalu di bawah notasi · Finger number selalu di tuts · Range keyboard hanya oktaf aktif |
| `beginner` | Clef color coding: treble = biru, bass = merah/oranye |
| `intermediate` | Semua hint off by default — hanya wrong flash |

---

# BAGIAN 8 — AUDIO SYSTEM

## 8.1 Pitch Detection

- Algorithm: **McLeod Pitch Method (NSDF)**
- dB threshold gate — abaikan noise di bawah threshold
- Range: A2–C7
- Tolerance: 50 cents default, configurable per note

## 8.2 Split Frekuensi (2 tangan)

- Split point di `meta.freq_split_hz` (default C4 = 261.63 Hz)
- Hz < split → bass clef listener
- Hz ≥ split → treble clef listener
- Configurable per lagu

## 8.3 Chord Detection

- Window 80ms setelah pitch pertama terdeteksi
- Semua pitch dalam window dicocokkan dengan expected chord
- Default 80ms — perlu tuning saat test lapangan

## 8.4 Audio Detection Philosophy

Microphone detection bersifat: noisy, imperfect, latency-sensitive.
Karena itu **timeline tidak boleh mengikuti mic**.

Audio hanya: validate, confirm, estimate performance.
Audio bukan penggerak timeline.

## 8.5 Background Music

- Format: MP3
- Engine: **`HTMLAudioElement` terpisah** dari Web Audio API chain
- Wajib terpisah — agar tidak masuk mic loop dan memicu pitch detection palsu
- Aktif di: Stage 1, Full Song Run-Through Mode
- Opsional di: Stage 2 dan 3 (user bisa toggle)

## 8.6 Contoh Audio Per Part

- Format: MP3 (diproduksi dari render MuseScore oleh Fay)
- Early beginner: **auto-play di awal Stage 1**
- Beginner ke atas: tombol "Dengar Contoh" opsional di Stage 1

## 8.7 Tap Note → Preview Suara

- Tap note di notasi → play suara via Web Audio synth
- Stage 1: tanpa penalty
- Stage 2 dan 3: penalty -5

## 8.8 Future Audio Upgrade

- ScriptProcessorNode → AudioWorklet (lebih akurat, off main thread)
- FFT + harmonic analysis untuk multi-pitch isolation
- Target: mendekati Simply Piano / Deep Piano accuracy

---

# BAGIAN 9 — NOTASI RENDERING

## 9.1 Engine: VexFlow

- Library standar untuk music notation di web
- Semua simbol benar: clef, time sig, key sig, accidentals, beams, ties, dots, rests, ornamen
- Output: **SVG** (dipilih atas Canvas untuk highlight by element ID)
- **Tidak ada gambar simbol manual**
- **Tidak ada manual x-positioning / slotIdx / pixel math**
- VexFlow Formatter menentukan posisi setiap note

### 9.1.1 Engraving Philosophy

VexFlow digunakan sebagai primary notation renderer dan formatter.
Namun aplikasi ini tidak mengejar mathematically-perfect proportional spacing.

Prioritas utama notation rendering adalah:

* educational readability
* optical balance
* musical phrasing feel
* engraving aesthetics
* visual breathing room

Renderer harus terasa seperti music typography,
bukan physics simulation atau pixel packing system.

Default VexFlow formatter behavior harus tetap menjadi foundation utama.
Custom layout logic hanya boleh:

* membantu visual balance
* memperbaiki readability
* menjaga aesthetic consistency antar system
* mencegah extreme spacing collapse

Dilarang:

* mengganti penuh formatter behavior dengan custom spacing engine
* membuat duration-based mathematical overfitting
* membuat song-specific spacing hacks
* membuat renderer menjadi engraving physics simulator

Notation layout decisions harus bersifat:

* lightweight
* renderer-guided
* optically motivated
* maintainable

Tujuan renderer bukan meniru penuh Dorico/LilyPond,
melainkan menghasilkan notation yang:

* clean
* stable
* educationally readable
* visually musical
  dalam context realtime interactive learning platform.

### 9.1.2 Engraving References

Notation rendering decisions should follow established standard music engraving conventions.

Primary references:

* Elaine Gould — *Behind Bars* (engraving conventions and notation semantics)
* MuseScore engraving behavior (practical open-source notation reference)
* VexFlow official API/documentation (renderer implementation behavior)

Important philosophy:

VexFlow is the rendering engine,
NOT the source of engraving rules.

Engraving semantics should follow standard notation conventions,
while remaining lightweight and educationally readable.

The renderer should avoid:

* inventing custom notation rules
* mathematically overfitting spacing systems
* attempting to replicate full Dorico/Sibelius engraving complexity

Priority order:

1. Educational readability
2. Standard notation correctness
3. Visual stability
4. Maintainable implementation
5. Engraving perfection (optional)


## 9.2 Notation Correctness

Semua notasi wajib mengikuti standard musik nyata:
- clef correctness
- beam grouping
- rhythmic grouping
- ties, rests, accidentals
- spacing consistency

Karena anak belajar dari apa yang mereka lihat.
Notation correctness lebih penting daripada gimmick visual.

## 9.3 Auto-scroll Notasi

- Viewport: **1–2 bar aktif** saja
- Scroll smooth ke bar berikutnya
- Zoom in/out tersedia

## 9.4 Grand Staff

- Level intermediate: treble + bass dalam satu system
- VexFlow `StaveConnector` untuk bracket di kiri

## 9.5 Note Highlight

- Stage 1: **orange** (SVG element by VexFlow note ID)
- Stage 2: **orange** + "?" overlay
- Stage 3: highlight aktif + progress bar
- Bukan digambar ulang — hanya CSS class/style change pada SVG element

## 9.6 Renderer Independence

Renderer harus replaceable di masa depan:
- VexFlow SVG → VexFlow Canvas → WebGL → native → PDF

Jangan mengikat gameplay atau runtime ke renderer internals.
Renderer tidak boleh menjadi source of gameplay logic,
timing authority, atau educational state.

Gameplay, timing, dan scoring tidak boleh membaca:

* pixel position
* SVG geometry
* DOM layout state
  sebagai gameplay authority.

Renderer hanya visual representation dari timeline event structure.

Future architecture dapat mendukung alternate rendering/export pipelines
(seperti Verovio atau LilyPond export)
untuk printable notation tanpa mempengaruhi realtime runtime architecture.

---

# BAGIAN 10 — KEYBOARD / TUTS DISPLAY

## 10.1 Auto-scroll Keyboard

- **Sliding window** yang auto-scroll ke range note aktif
- Tidak tampil full keyboard — hanya range yang relevan
- Scroll smooth ke area tuts aktif
- User tidak perlu tap tuts yang jauh

## 10.2 Visual Tuts

| Kondisi | Warna |
|---|---|
| Note aktif Stage 1 / hint | Orange |
| Treble aktif Stage 2+ | Biru |
| Bass aktif Stage 2+ | Merah/oranye |
| Dipencet salah | Flash merah |
| Narrowing hint | Kuning |
| Finger number | Label di atas tuts (always-on untuk early_beginner) |

## 10.3 Tap Tuts

- User bisa tap tuts di layar = trigger note (tanpa piano fisik)
- Paralel dengan mic detection
- Berguna untuk Stage 1 eksplorasi

---

# BAGIAN 11 — PIPELINE LAGU

## 11.1 Workflow

```
MuseScore (.mxl)
     ↓
mxl_to_song.py         ← offline Python tool (music21)
     ↓
song.json              ← data contract (timeline event structure)
     ↓
validate_song.py       ← validator (sangat direkomendasikan)
     ↓
runtime-engine + notation-renderer + gameplay-engine + pitch-engine + hint-engine
     (semua JS, hanya baca song.json — tidak tahu Python)
```

Generator hanya dijalankan **sekali offline** oleh Fay saat menambah lagu baru.
Engine JS di browser tidak tahu Python — hanya membaca `song.json`.

---

## 11.2 Kenapa Python + music21, Bukan Node.js Custom Parser

music21 adalah library Python standar industri untuk analisis MusicXML.
Dipakai oleh MIT, penelitian musik akademik, dan tools profesional.

| Kemampuan | music21 | Custom XML parser (Node.js) |
|---|---|---|
| Parsing akurasi | Sangat tinggi | Harus handle semua edge case sendiri |
| Pickup bar (anacrusis) | Otomatis terdeteksi | Logic manual |
| Tied notes | Otomatis di-resolve | Tracking manual |
| Chord grouping | Otomatis | Logic manual |
| Tempo changes mid-song | Otomatis | Tracking manual |
| Grace notes | Terdeteksi, bisa di-skip | Sulit dideteksi |
| Ottava (8va/8vb) | Terdeteksi | Sangat sulit |
| Chopin complexity | Sangat siap | Berisiko edge case terlewat |
| Dependency | Python + music21 | Node.js only |

Untuk lagu sekompleks Chopin Nocturne, music21 adalah pilihan yang jauh
lebih aman dan scalable.

---

## 11.3 Setup Generator

### Install
```bash
pip install music21
```

### Struktur file
```
tools/
├── mxl_to_song.py      ← generator utama
└── validate_song.py    ← validator output
```

### Usage
```bash
# Basic
python tools/mxl_to_song.py input.mxl songs/output.json

# Dengan options
python tools/mxl_to_song.py input.mxl songs/output.json \
  --part-size 4 \
  --bpm 72 \
  --level early_beginner
```

---

## 11.4 Cara Generator Bekerja — Step by Step

### Step 1: Parse MXL

```python
from music21 import converter

score = converter.parse('input.mxl')
# score.parts[0] = treble staff (tangan kanan)
# score.parts[1] = bass staff (tangan kiri)
# Keduanya berjalan paralel dalam waktu
```

MuseScore piano selalu menghasilkan **2 Part** dalam satu score:
- `parts[0]` = treble clef
- `parts[1]` = bass clef

### Step 2: Deteksi Clef per Part

```python
from music21 import clef

def detect_clef(part):
    clefs = part.recurse().getElementsByClass('Clef')
    if clefs:
        c = clefs[0]
        if isinstance(c, clef.TrebleClef):
            return 'treble'
        elif isinstance(c, clef.BassClef):
            return 'bass'
    return 'treble'  # default
```

### Step 3: Kalkulasi t_ms dan duration_ms

`t_ms` adalah absolute timestamp dari awal lagu (dalam milliseconds).
`duration_ms` adalah durasi event tersebut.

**Formula:**
```
t_ms        = (offset_quarterLength / bpm) * 60000
duration_ms = (quarterLength / bpm) * 60000
```

music21 menggunakan `quarterLength` sebagai unit internal:
- whole note   = 4.0
- half note    = 2.0
- quarter note = 1.0
- eighth note  = 0.5
- dotted quarter = 1.5  (sudah include dot, tidak perlu hitung manual)

BPM bisa berubah mid-song (tempo changes). Generator harus track BPM aktif
saat setiap event terjadi:

```python
from music21 import tempo

def get_bpm_at_offset(score, offset):
    """Ambil BPM aktif di offset tertentu."""
    marks = score.flat.getElementsByClass('MetronomeMark')
    current_bpm = 72  # default jika tidak ada tempo marking
    for mark in marks:
        if mark.offset <= offset:
            current_bpm = mark.number
        else:
            break
    return current_bpm
```

### Step 4: Parse Note, Chord, Rest

```python
from music21 import note, chord

def note_name(pitch):
    """Konversi pitch ke format string: C4, F#3, Bb5."""
    step = pitch.step
    octave = pitch.octave
    if pitch.accidental:
        if pitch.accidental.name == 'sharp':
            acc = '#'
        elif pitch.accidental.name == 'flat':
            acc = 'b'
        elif pitch.accidental.name == 'double-sharp':
            acc = '##'
        elif pitch.accidental.name == 'double-flat':
            acc = 'bb'
        else:
            acc = ''
    else:
        acc = ''
    return f"{step}{acc}{octave}"

def duration_type(quarter_length):
    """Konversi quarterLength ke string duration."""
    mapping = {
        4.0:  'w',     # whole
        3.0:  'h.',    # dotted half
        2.0:  'h',     # half
        1.5:  'q.',    # dotted quarter
        1.0:  'q',     # quarter
        0.75: '8.',    # dotted eighth
        0.5:  '8',     # eighth
        0.375:'16.',   # dotted sixteenth
        0.25: '16',    # sixteenth
        0.125:'32',    # thirty-second
    }
    return mapping.get(quarter_length, 'q')  # fallback quarter

def parse_element(el, clef_name, bar_n, score, ev_counter):
    """Parse satu elemen (note/chord/rest) menjadi event dict."""
    bpm = get_bpm_at_offset(score, el.offset)
    t_ms = round((el.offset / bpm) * 60000 * (bpm / 60))

    # Hitung t_ms yang benar:
    # quarterLength offset dari awal lagu (bukan dari awal measure)
    # music21 .flat memberi offset absolut dari awal score
    t_ms = round(el.offset * (60000 / bpm))
    duration_ms = round(el.duration.quarterLength * (60000 / bpm))

    ev_id = f"ev_{ev_counter:06d}"

    # Grace notes: skip untuk MVP
    if el.duration.isGrace:
        return None

    if el.isRest:
        return {
            "id": ev_id,
            "bar": bar_n,
            "clef": clef_name,
            "type": "rest",
            "duration": duration_type(el.duration.quarterLength),
            "duration_ms": duration_ms,
            "t_ms": t_ms
        }

    elif isinstance(el, chord.Chord):
        return {
            "id": ev_id,
            "bar": bar_n,
            "clef": clef_name,
            "type": "chord",
            "notes": [note_name(n.pitch) for n in el.notes],
            "duration": duration_type(el.duration.quarterLength),
            "duration_ms": duration_ms,
            "t_ms": t_ms,
            "tie_start": el.tie is not None and el.tie.type in ('start', 'continue'),
            "tie_stop":  el.tie is not None and el.tie.type in ('stop', 'continue'),
            "tolerance_cents": 50
        }

    elif isinstance(el, note.Note):
        finger = None
        # Ambil fingering jika ada di notations
        for n in el.notations:
            if hasattr(n, 'fingerNumber'):
                finger = n.fingerNumber
                break

        return {
            "id": ev_id,
            "bar": bar_n,
            "clef": clef_name,
            "type": "note",
            "notes": [note_name(el.pitch)],
            "duration": duration_type(el.duration.quarterLength),
            "duration_ms": duration_ms,
            "t_ms": t_ms,
            "finger": finger,
            "tie_start": el.tie is not None and el.tie.type in ('start', 'continue'),
            "tie_stop":  el.tie is not None and el.tie.type in ('stop', 'continue'),
            "tolerance_cents": 50
        }

    return None
```

### Step 5: Merge Treble + Bass ke Flat Timeline

Kedua part berjalan **paralel dalam waktu**.
Setelah parse masing-masing part, gabungkan dan sort by `t_ms`:

```python
all_events = treble_events + bass_events
all_events.sort(key=lambda e: (e['t_ms'], e['clef']))
# treble sebelum bass jika t_ms sama
```

Event dengan `t_ms` yang sama berarti **dimainkan bersamaan** (mode both).

### Step 6: Pairing Treble + Bass (mode both)

Untuk `hand_mode == "both"`, event treble dan bass di `t_ms` yang sama
diberi referensi satu sama lain:

```python
def pair_simultaneous(events):
    """Set pair_with_id untuk event yang terjadi bersamaan."""
    by_time = {}
    for ev in events:
        t = ev['t_ms']
        if t not in by_time:
            by_time[t] = []
        by_time[t].append(ev)

    for t, group in by_time.items():
        treble = [e for e in group if e['clef'] == 'treble']
        bass   = [e for e in group if e['clef'] == 'bass']
        if treble and bass:
            treble[0]['pair_with_id'] = bass[0]['id']
            bass[0]['pair_with_id']   = treble[0]['id']

    return events
```

### Step 7: Deteksi Pickup Bar

```python
def has_pickup(score):
    """Deteksi apakah lagu punya pickup bar (anacrusis)."""
    first_measure = score.parts[0].getElementsByClass('Measure')[0]
    # Pickup bar biasanya measure.number == 0
    # atau measure.barDuration != measure.duration
    if first_measure.number == 0:
        return True
    # Cara lain: cek apakah measure pertama tidak penuh
    ts = first_measure.timeSignature
    if ts and first_measure.duration.quarterLength < ts.barDuration.quarterLength:
        return True
    return False
```

### Step 8: Build song.json

Generator merakit semua data menjadi struktur `song.json` final:

```python
def build_song_json(score, events, args):
    parts_list = build_parts(events, args.part_size)

    return {
        "meta": {
            "id": args.id or slugify(score.metadata.title),
            "title": score.metadata.title or "Untitled",
            "composer": score.metadata.composer or "Unknown",
            "level": args.level,
            "bpm": get_initial_bpm(score),
            "time_signature": get_time_signature(score),
            "key_signature": get_key_signature(score),
            "hand_mode": "both" if len(score.parts) >= 2 else "rh_only",
            "active_clefs": get_active_clefs(score),
            "freq_split_hz": 261.63,
            "part_size_bars": args.part_size,
            "background_music": None,   # diisi manual setelah generate
            "example_audio": None,       # diisi manual setelah generate
            "hint_config": DEFAULT_HINT_CONFIG
        },
        "parts": parts_list,
        "score": {
            "bars": build_bars(events)
        },
        "scoring": DEFAULT_SCORING_CONFIG
    }
```
### 9.1.1 Engraving Philosophy

VexFlow digunakan sebagai primary notation renderer dan formatter.
Namun aplikasi ini tidak mengejar mathematically-perfect proportional spacing.

Prioritas utama notation rendering adalah:

* educational readability
* optical balance
* musical phrasing feel
* engraving aesthetics
* visual breathing room

Renderer harus terasa seperti music typography,
bukan physics simulation atau pixel packing system.

Default VexFlow formatter behavior harus tetap menjadi foundation utama.
Custom layout logic hanya boleh:

* membantu visual balance
* memperbaiki readability
* menjaga aesthetic consistency antar system
* mencegah extreme spacing collapse

Dilarang:

* mengganti penuh formatter behavior dengan custom spacing engine
* membuat duration-based mathematical overfitting
* membuat song-specific spacing hacks
* membuat renderer menjadi engraving physics simulator

Notation layout decisions harus bersifat:

* lightweight
* renderer-guided
* optically motivated
* maintainable

Tujuan renderer bukan meniru penuh Dorico/LilyPond,
melainkan menghasilkan notation yang:

* clean
* stable
* educationally readable
* visually musical
  dalam context realtime interactive learning platform.


---

## 11.5 Edge Cases yang Di-handle Generator

| Edge Case | Cara Handle |
|---|---|
| Pickup bar | Deteksi `measure.number == 0` atau measure tidak penuh → `has_pickup: true` di part pertama |
| Tied notes | `note.tie.type` → set `tie_start` / `tie_stop` di event |
| Grace notes | `duration.isGrace == True` → **skip** untuk MVP, diberi warning |
| Dotted notes | `quarterLength` musik21 sudah include dot otomatis |
| Accidentals | `pitch.accidental.name` → `#`, `b`, `##`, `bb` |
| Tempo changes | Track `MetronomeMark` per offset — setiap event pakai BPM aktif saat itu |
| Key changes | Track `KeySignature` per measure |
| Time sig changes | Track `TimeSignature` per measure |
| Multi-voice (layer) | Ambil voice 1 per staff untuk MVP — voice 2+ diberi warning |
| Ottava (8va/8vb) | music21 resolve pitch otomatis — output sudah pitch yang benar |
| Cross-staff beaming | music21 handle — output per staff sudah benar |

---

## 11.6 t_ms — Kalkulasi Yang Benar

`t_ms` adalah **absolute timestamp dari awal lagu** dalam milliseconds.

Gunakan `.flat` dari music21 untuk mendapatkan offset absolut per element
(bukan offset relatif dari awal measure):

```python
# BENAR — offset absolut dari awal lagu
for el in part.flat.notesAndRests:
    t_ms = round(el.offset * (60000 / bpm))

# SALAH — offset dari awal measure saja
for measure in part.getElementsByClass('Measure'):
    for el in measure.notesAndRests:
        t_ms = round(el.offset * ...)  # ini offset dari awal measure, bukan lagu
```

Jika ada tempo changes, `bpm` harus di-update setiap kali `MetronomeMark`
ditemukan sebelum offset element tersebut.

---

## 11.7 Output song.json — Contoh Per Event

```json
{
  "id": "ev_000001",
  "bar": 1,
  "clef": "treble",
  "type": "note",
  "notes": ["C4"],
  "duration": "q",
  "duration_ms": 833,
  "t_ms": 0,
  "finger": 1,
  "tie_start": false,
  "tie_stop": false,
  "tolerance_cents": 50
},
{
  "id": "ev_000002",
  "bar": 1,
  "clef": "bass",
  "type": "chord",
  "notes": ["C3", "E3", "G3"],
  "duration": "h",
  "duration_ms": 1666,
  "t_ms": 0,
  "pair_with_id": "ev_000001",
  "tie_start": false,
  "tie_stop": false,
  "tolerance_cents": 50
},
{
  "id": "ev_000003",
  "bar": 1,
  "clef": "treble",
  "type": "rest",
  "duration": "q",
  "duration_ms": 833,
  "t_ms": 833
}
```

---

## 11.8 validate_song.py

Jalankan setelah generate untuk memastikan output benar:

```bash
python tools/validate_song.py songs/output.json
```

Validator memeriksa:
- Setiap event punya `id` yang unique dan format `ev_XXXXXX`
- Setiap event punya `t_ms`, `duration_ms`, `type`, `clef`, `bar`
- `notes[]` tidak kosong untuk type `note` dan `chord`
- Tidak ada `t_ms` negatif
- `duration_ms` > 0 untuk semua event
- `pair_with_id` merujuk ke ID yang benar-benar ada
- Tied notes punya pasangan (`tie_start` selalu diikuti `tie_stop`)
- Tidak ada overlapping event di clef dan t_ms yang sama
- BPM valid (> 0)
- `bar` number sequential dan tidak ada yang loncat

---

## 11.9 Field yang Diisi Manual Setelah Generate

Field berikut **tidak bisa diisi otomatis** oleh generator
karena bergantung pada file audio yang diproduksi Fay terpisah:

```json
"background_music": {
  "src": "audio/bg_namalagu.mp3",
  "volume": 0.3,
  "loop": true
},
"example_audio": {
  "full": "audio/namalagu_full.mp3",
  "parts": [
    "audio/namalagu_part1.mp3",
    "audio/namalagu_part2.mp3"
  ]
}
```

Dan per part:
```json
"example_audio": "audio/namalagu_part1.mp3"
```

Generator mengisi field ini dengan `null` — Fay update manual
setelah MP3 diproduksi dari MuseScore.

---

# BAGIAN 12 — PRACTICE MODES

Architecture harus mendukung practice modes sejak awal.
Jika tidak dirancang dari awal, future refactor akan sangat besar.

| Mode | Deskripsi |
|---|---|
| `full_song` | Default — main dari awal sampai akhir |
| `loop_measure` | Loop satu bar tertentu |
| `loop_phrase` | Loop satu part/phrase |
| `rh_only` | Hanya tangan kanan (treble) |
| `lh_only` | Hanya tangan kiri (bass) |
| `listen_only` | Stage 1 on-demand, tidak ada scoring |
| `slow_motion` | Tempo sangat lambat untuk debugging |

MVP cukup implement `full_song`. Tapi architecture tidak boleh mengunci modes lain.

---

# BAGIAN 13 — CLEAN CODE RULES

## 13.1 No Temporary Hacks Without Label

Temporary fix diperbolehkan untuk MVP, tapi wajib diberi label:
```javascript
// TEMP_MVP: Simplified chord detection.
// Replace after stable playable MVP.
```

Temporary workaround tidak boleh menjadi architecture permanen.

## 13.2 Dead Code Policy

Jika helper tidak dipakai, system sudah obsolete, atau architecture sudah diganti:
→ **delete immediately**

Jangan simpan "mungkin nanti dipakai".
Gunakan Git untuk history. Bukan project folder untuk arsip.

## 13.3 Refinement Rule

Refinement hanya dilakukan **setelah checkpoint selesai**, bukan di tengah feature.

Setelah checkpoint:
- remove dead code
- consolidate duplicated logic
- normalize APIs
- cleanup temporary structures

## 13.4 Development Velocity Rule

Jika sistem:
- masih berjalan
- architecture inti masih sehat
- masih bisa mencapai checkpoint berikutnya

→ **lanjutkan development.**

Jangan berhenti terlalu lama untuk perfect cleanup, ideal abstraction,
atau defensive optimization sebelum checkpoint tercapai.

## 13.5 Layer 3 Semantic Contract Freeze Rule

Beberapa feature sudah di-freeze setelah diimplementasi dan distabilkan.
**Frozen contract tidak boleh diubah secara diam-diam oleh MusicXML baru atau refactor.**

### Layer 3 features yang sudah frozen (Session 38):

**Staccato** (Sessions 33–35):
- `duration_ms` tidak pernah diubah oleh staccato
- `t_ms` dan event dispatch timing tidak pernah berubah
- Audio: `performedDurationMs = duration_ms × 0.5`
- Visual: dot notehead-centric, opposite stem side
- Field `articulations` tidak pernah muncul pada event rest

**Slur** (Sessions 36–37):
- `slur_stop: true` tidak pernah men-suppress audio attack
- Slur tidak mengubah `duration_ms`
- `_drawSlurs` dan `_drawTies` tidak pernah berbagi infrastructure
- Placement mengikuti MuseScore source intent — tidak ada auto-flip heuristic
- Cross-system slurs: deferred (silently skipped)
- Slur playback shaping: out of scope untuk MVP

### Regression check untuk MusicXML baru:

Jika MusicXML baru menghasilkan behavior berbeda dari frozen contract di atas:
→ **Ini adalah violation, bukan feature baru.**
→ Investigasi sebelum menerima.
→ Jika perlu mengubah contract, lakukan formal contract revision dengan DEVLOG entry.

Lihat detail teknis di:
- `docs/music-notation-semantics.md` §9 invariants (I11, I12, I13, I14)
- `docs/engraving-standards.md` §7b

---

# BAGIAN 14 — DEVELOPMENT CHECKPOINTS

## CHECKPOINT 1 — PLAYABLE VISUAL MVP
- [ ] Load song.json
- [ ] Render VexFlow SVG
- [ ] Highlight active note (orange)
- [ ] Autoplay simulation (tanpa mic dulu)
- [ ] Timeline berjalan stabil
- [ ] Stage 1 Explore working

**Outcome:** Sudah terasa seperti aplikasi nyata.

## CHECKPOINT 2 — PLAYABLE INPUT MVP
- [ ] Microphone detection (McLeod NSDF)
- [ ] Pitch judge basic
- [ ] Correct/wrong detection
- [ ] Score basic
- [ ] Miss handling
- [ ] Stage 2 Recognize working

**Outcome:** Sudah bisa dipakai latihan sederhana.

## CHECKPOINT 3 — EDUCATIONAL MVP
- [ ] Hint system lengkap
- [ ] 4 tempo modes (Easy/Grave/Andante/Moderato)
- [ ] Progress bar per note
- [ ] Retry flow
- [ ] Star rating
- [ ] Stage 3 Sight Play working
- [ ] Part unlock system

**Outcome:** Sudah usable untuk beginner lesson.

## CHECKPOINT 4 — BEGINNER PLATFORM
- [ ] Grand staff (treble + bass)
- [ ] Chord detection
- [ ] Split frekuensi RH/LH
- [ ] Full Song Run-Through Mode
- [ ] Practice modes

**Outcome:** Platform edukasi awal yang lengkap.

## CHECKPOINT 5 — WEBSITE (Future)
- [ ] Netflix-style song library UI
- [ ] User progress (localStorage → Supabase)
- [ ] Teacher report (WhatsApp share)
- [ ] Native app wrapper (Electron / Tauri)

---

# BAGIAN 15 — TECH STACK

| Komponen | Library / Tech | Alasan |
|---|---|---|
| Notasi | VexFlow 4.x (CDN) | Standar industri, semua simbol benar |
| Notasi output | SVG | Mudah highlight by element ID |
| Audio detection | Web Audio API (native) | Tidak perlu library |
| Pitch algorithm | McLeod NSDF (vanilla JS) | Proven di project Fay sebelumnya |
| Background music | HTMLAudioElement (native) | Terpisah dari Web Audio chain |
| MXL generator | Python + music21 | Handles semua edge case musik kompleks |
| MXL validator | Python (validate_song.py) | Verifikasi output sebelum dipakai engine |
| UI shell | Vanilla HTML/CSS/JS | Konsisten dengan stack Fay |
| Hosting test | file:// lokal / live-server | Iterasi cepat |
| Hosting prod | Netlify / GitHub Pages | Free tier, sudah familiar |

---

# BAGIAN 16 — KEPUTUSAN FINAL

Tabel ini berisi semua keputusan yang sudah final.
**Jangan diubah tanpa diskusi eksplisit.**

| Keputusan | Nilai Final |
|---|---|
| Format data | Timeline event structure dengan `t_ms` absolut + `duration_ms` |
| Event identity | Permanent ID `ev_XXXXXX` — bukan array index |
| Generator tool | Python + music21 — bukan custom XML parser |
| Generator output | `song.json` dengan semua field lengkap termasuk `t_ms` per event |
| Generator runtime | Offline only — bukan bagian dari browser app |
| Field `t_ms` | Dihitung via music21 `.flat` offset — engine tidak hitung ulang |
| Field `pair_with_id` | Diset generator saat `t_ms` sama di treble dan bass |
| Grace notes MVP | Di-skip generator, diberi warning di output |
| Audio fields | Diisi manual oleh Fay setelah MP3 diproduksi |
| Notasi engine | VexFlow only — tidak ada gambar simbol manual |
| Notasi layout | VexFlow Formatter — tidak ada manual x-positioning |
| Notasi output | SVG — bukan Canvas |
| Timeline authority | runtime-engine.js saja |
| Gameplay logic | gameplay-engine.js terpisah dari runtime |
| Pitch detection | McLeod NSDF, split Hz configurable per lagu |
| Background music | HTMLAudioElement terpisah dari Web Audio chain |
| Stage 1 — Explore | App yang memainkan — orange highlight bergerak otomatis |
| Stage 2 — Recognize | Tanpa timer, hint 1x per note, scoring berdasarkan kecepatan jawab |
| Stage 3 — Sight Play | Timeline kontrol utama — user yang mengikuti |
| Tempo pilihan | 4 tombol: Easy(Largo)/Grave/Andante/Moderato — bukan slider |
| Tempo availability | Semua selalu tersedia, tidak ada yang di-disable |
| Nama tempo terbawah | "Easy (Largo)" |
| Contoh audio early_beginner | Auto-play di awal Stage 1 |
| Wrong answer | Progress bar pause — bukan reset |
| Hint per note Stage 2 | 1x saja per note |
| Part unlock | ≥ ⭐⭐ di Stage 2 |
| Communication rule | Events/callbacks satu arah — runtime ke engine lain |
| Cross-engine helpers | Dilarang — generic utils ke shared/utils.js saja |
| Dead code | Hapus langsung — pakai Git untuk history |
| Engraving philosophy | Optical readability & musical balance lebih penting daripada strict mathematical proportional spacing |
| Renderer authority | VexFlow formatter tetap primary engraving foundation — custom logic hanya refinement layer |

---

# BAGIAN 17 — YANG MASIH OPEN


Diputuskan saat coding atau testing:

| Topik                          | Catatan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail komunikasi engine       | Direct callback vs EventEmitter — prinsip satu arah tetap dijaga                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Chord detection window         | Default 80ms — perlu tuning lapangan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Replay hasil permainan         | Audio recording mic vs reconstruct dari events — belum diputuskan                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AudioWorklet upgrade           | ScriptProcessorNode untuk MVP, AudioWorklet untuk produksi                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Viewport zoom default          | Perlu test di berbagai ukuran layar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Part size default              | 4 bar — bisa override per lagu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Phrase-aware part segmentation | MVP saat ini masih menggunakan fixed part_size_bars (2/4/8). Future architecture harus mendukung custom part boundary berbasis frase musik dan pickup feel. Contoh: part dapat dimulai dari bar 1 beat 4 sampai bar 4 beat 3, lalu part berikutnya dimulai dari bar 4 beat 4. Tujuan: menjaga pickup note tetap menjadi awal frase musikal, bukan akhir frase sebelumnya. Generator tidak perlu auto-detect phrase untuk MVP. Future implementation dapat berupa custom part range metadata atau manual segmentation oleh Fay/teacher. |
| Enharmonic spelling awareness  | MVP saat ini mengikuti spelling dari music21 (contoh: C# vs Db). Future architecture dapat mempertimbangkan key signature, mode, dan harmonic context untuk menentukan enharmonic spelling yang lebih musikal dan educationally correct. Contoh: pada konteks D minor gunakan C# sebagai leading tone daripada Db. Ini adalah future notation intelligence feature dan bukan blocker untuk runtime, pitch detection, atau gameplay MVP.                                                                                                |


---

*Dokumen ini adalah single source of truth MyKey Music Labs.*
*Versi: Final pre-coding — siap digunakan di Claude Code.*
*Stack: VexFlow · Web Audio API · McLeod NSDF · Vanilla JS · Node.js*
*Gabungan dari: SPEC.md + ENGINE_BOUNDARIES.md + MASTER_PROJECT_DIRECTION.md +*
*INDUSTRY_LOGIC_AND_PRODUCT_RULES.md + CLAUDE_CODE_BOOTSTRAP.md*

---

# BAGIAN 18 — AUDIO DETECTION PHILOSOPHY

## 18.1 Hybrid Detection Architecture

Engine menggunakan hybrid audio detection architecture.
Core detection memprioritaskan:
- low latency
- predictable realtime behavior
- musical timing stability
- beginner-friendly tolerance
- deterministic DSP-based analysis

## 18.2 Primary Realtime Detection

Primary realtime detection mengandalkan:
- onset detection
- pitch estimation (McLeod NSDF)
- amplitude analysis
- timing window evaluation
- sustain handling
- silence/noise gating

## 18.3 AI/ML sebagai Secondary Layer Only

AI/ML-assisted interpretation hanya boleh digunakan sebagai secondary enhancement untuk:
- confidence scoring
- noise filtering
- adaptive thresholds
- humanized timing interpretation
- ambiguity correction
- user skill adaptation

**Dilarang:** fully AI-generated note transcription sebagai primary realtime gameplay mechanism.

## 18.4 Detection Intent

Detection bertujuan menginterpretasi **musical intent** pemain — bukan memaksakan rigid note recognition.

Gameplay experience harus terasa:
- musical
- forgiving
- responsive
- expressive
- enjoyable untuk beginner dan intermediate

## 18.5 Realtime Priorities

Realtime gameplay stability lebih tinggi prioritasnya dari:
- transcription accuracy perfection
- complex ML inference
- full polyphonic reconstruction
- heavyweight AI pipelines

System harus tetap:
- responsive
- lightweight
- maintainable
- modular
- portable antara Python tooling dan WebAudio runtime

## 18.6 Scope per Platform

**Python** digunakan untuk:
- prototyping
- offline analyzers
- dataset generation
- timing validation tools

**Web runtime** dioptimalkan untuk:
- low latency
- gameplay responsiveness
- stable timing synchronization

## 18.7 Architecture Support

System harus mendukung:
- realtime gameplay detection
- offline analysis tools
- future adaptive learning systems
- configurable timing tolerance
- dynamic difficulty adjustment

---

## §19 Current Product Direction

*(Added: 2026-05-23 — Session 51 stabilization milestone)*

MyKey Music Labs berada di fase **Checkpoint 1 — Stabilization Complete**.

**Yang sudah selesai:**
- Stage 1 Explore: functional — notation renders, playback syncs, keyboard highlights, hand-filter aktif, tempo scaling, practice loop, segment navigation
- Seluruh notasi semantik inti (ties, beams, stems, accidentals, slurs, staccato) frozen dan validated
- Data pipeline lengkap: MuseScore → `mxl_to_song.py` → `song.json` → browser
- Authoring workflow lengkap: `authoring.html` + `update_song_index.py`
- Engine architecture clean dan documented

**Yang belum dibangun:**
- Stage 2 Play (gameplay/scoring — Checkpoint 2)
- Stage 3 Listen (pitch detection/microphone — Checkpoint 3)
- Adaptive difficulty
- Student progress tracking

**Fokus saat ini:** Mempersiapkan Checkpoint 2 — gameplay/scoring layer. Architecture harus tetap clean untuk penambahan ini.

---

## §20 Architecture Principles

*(Added: 2026-05-23)*

**Single timeline authority:** `RuntimeEngine` adalah SATU-SATUNYA sumber kebenaran timing. Semua sistem lain adalah passive consumers dari callback-nya. Tidak ada engine lain yang boleh memanipulasi `t_ms`, `performance.now()`, atau playback position secara langsung.

**One-way callback flow:** Runtime fires → interaction adapter (index.html) → query presentation layer → render/audio/keyboard. Tidak ada circular dependencies. Tidak ada callback fan-in.

**Passive renderer:** `NotationRenderer` merender full score sekali per song load. Ia TIDAK merespons playback events, TIDAK tahu tentang segments, TIDAK punya pendapat tentang bar mana yang "current."

**Semantic authority chain:** `song.json` (set oleh `mxl_to_song.py`) → `RuntimeEngine` (dispatches) → `LearningModeState` (queries) → presentation layer (display). Setiap layer membaca dari layer di atasnya; tidak ada yang menulis balik ke upstream.

**Presentation layer isolation:** `LearningModeState`, `KeyboardViz`, dan UI code di index.html adalah presentation-only. Mereka TIDAK boleh: mutate song.json fields, call renderer internal methods, atau membuat timing-sensitive loops.

**Engine boundary rule:** Setiap engine punya single owner. Tidak ada engine yang membaca private state engine lain secara langsung.

---

## §21 Stable Systems

*(Added: 2026-05-23)*

Per 2026-05-23, sistem berikut frozen dan tidak boleh diubah secara diam-diam:

| System | Status | Dokumen otoritatif |
|--------|--------|-------------------|
| `src/runtime-engine.js` | Frozen | `docs/runtime-contract.md` |
| `src/notation-renderer.js` Layer 2+3 | Frozen | `docs/engraving-standards.md` §10 |
| `src/song-loader.js` callback interface | Stable | `docs/learning-segment-architecture.md` §5 |
| `src/learning-state.js` HAND_COLOR constants | Stable | definisi static class fields |
| `src/keyboard-viz.js` typed event protocol | Stable | `src/keyboard-viz.js` |
| `song.json` data contract | Frozen | `docs/runtime-contract.md` §2 |

**Frozen** = API dan behavior tidak boleh berubah tanpa update semua consumers dan authority documents.  
**Stable** = Actively maintained; breaking changes memerlukan review dan cross-file updates.

---

## §22 Runtime Boundaries

*(Added: 2026-05-23)*

### §22.1 RuntimeEngine contract

`RuntimeEngine` owns:
- `t_ms` (current playback position, ms since song start)
- `onEventEnter(ev)` / `onEventExit(ev)` callbacks
- `play({ start_ms, end_ms })`, `pause()`, `stop()`, `seek(t_ms)` public API
- Internal `_tick()` loop (RAF)

`RuntimeEngine` does NOT own:
- Audio synthesis (terpisah di `_playNote()` / future `audio-engine.js`)
- Notation rendering (terpisah di `NotationRenderer`)
- Keyboard highlighting (terpisah di `KeyboardViz`)
- UI state machine (index.html)

### §22.2 stop() vs seek() asymmetry

`seek()` fires `onEventExit` untuk semua active events sebelum repositioning → presentation layer clear otomatis.

`stop()` TIDAK fire exits → setiap presentation layer harus ditambahkan ke `clearAll()` fan-out eksplisit di index.html. Setiap modul presentation baru harus menambahkan dirinya ke stop-fan-out block.

Ini disengaja per `runtime-contract.md §4.4` — stop adalah catastrophic reset, bukan orderly shutdown.

### §22.3 PracticeLoop vs learning_segments

**PracticeLoop** — runtime-only, session-scoped, non-destructive:
- User-defined loop selama satu play session
- Hidup di index.html (3 buttons + status span)
- Menggunakan `runtime.play({ start_ms, end_ms })` dengan bar→ms lookup
- Tidak dipersist antar session
- Tidak ada engine API baru — reuses `play()` contract yang sudah ada

**learning_segments** — authored curriculum di song.json:
- Instructor-defined pedagogical navigation units
- Author dalam bar+beat; resolved ke `{ start_ms, end_ms }` di load time oleh `SongLoader._resolveSegments()`
- RuntimeEngine hanya menerima resolved ms range — tidak pernah menerima bar/beat values
- Ketiadaan `learning_segments` di song.json → `resolvedSegments = []` (backwards compatible)

**Kedua sistem ini INDEPENDENT.** Jangan gabungkan code path-nya. PracticeLoop adalah user navigation tool; learning_segments adalah curriculum structure.

---

## §23 Semantic Freeze Contracts

*(Added: 2026-05-23)*

Semantik notasi berikut frozen dan validated. Tidak boleh berubah secara diam-diam:

**Tie rendering (Sessions 18–25):**
- Rests secara aktif memutus pending ties (clef sama, dihapus tanpa warning)
- Arc hanya digambar jika `tie_stop` adalah event next-same-clef langsung setelah `tie_start` — tidak ada notes atau rests di antaranya
- Chord ties: satu `VF.StaveTie` independen per pitch pair
- `_noteHeadProxy` pattern untuk chord notehead indices > 0 (VexFlow `note.getYs()[n>0]` adalah undefined di compiled bundle 5.0.0)
- `tie_stop: true` menekan audio attack; jika arc ditolak renderer, `tie_stop` juga harus `false`

**Slur rendering (Sessions 36–37):**
- Same-system single-span slurs saja (cross-system silently skipped — open item §25)
- `slur_start`/`slur_stop` di song.json adalah semantic; audio engine mengabaikannya

**Staccato (Sessions 32–35):**
- `staccato: true` di song.json → audio duration dikurangi ke 50% dari `duration_ms`
- Staccato dot: ditempatkan oleh `_drawStaccatoDot()`, position-based per stem direction
- Chord staccato: attached ke extremal notehead (paling jauh dari stem)

**Beam grouping (Sessions 12–13):**
- Beat-aware grouping via `t_ms`-based `beatIdx`
- Tidak ada cross-beat beams
- Beam flag suppression: correct draw-order pipeline

**Stem direction (Sessions 14–17):**
- Position-based (step < middle rule, B4/D3 middle lines)
- Chord/beam: furthest-note rule per Gould §4 (`_furthestStepFrom`, Gould tie-break)

**Accidental carry rules (Session 30):**
- Accidentals dibawa dalam satu bar — tidak diulang jika sudah diterapkan
- Key-signature accidentals ditekan jika sudah berlaku
- Latent bug: natural signs tidak diinsert saat note membatalkan key-signature accidental (non-C-major keys). Belum terpicu di test songs saat ini.

**Pickup bar alignment (Sessions 10–11):**
- GhostNote temporal positioning
- Trailing barline margin: `formatW = noteAreaW × 0.90`

**Enter-before-exit ordering (runtime-contract.md §4.5):**
- `_processEnters()` fires sebelum `_processExits()` setiap tick
- Presentation layer yang clear-on-exit TIDAK BOLEH call clearLabel/clearHighlight dari `onEventExit` untuk note yang baru saja enter — note berikutnya sudah enter di tick yang sama

---

## §24 Current Roadmap

*(Added: 2026-05-23)*

**Checkpoint 2 — Gameplay/Scoring:**
1. Audio engine extraction (`audio-engine.js`) — isolate `_playNote()`, `_noteToHz()`, `_audioCtx` dari index.html sebelum gameplay menambah subscribers
2. Gameplay engine foundation — Stage 2 Play (evaluasi note terhadap referensi)
3. Scoring display — result UI untuk correct/incorrect/missed

**Layer 3 notation remaining (priority order):**
4. Natural sign insertion — latent bug accidental carry di non-C-major keys (medium priority)
5. Compound meter beam grouping — diperlukan sebelum lagu 6/8
6. Collision detection — advanced repertoire only (prioritas terendah)

**Audio pipeline:**
7. Ganti `_playNote()` WebAudio synth dengan `example_audio` MP3 playback (setelah Fay produksi audio files)

**Checkpoint 3 — Listen:**
8. Pitch detection integration (`pitch-engine.js`) — McLeod NSDF
9. Stage 3 Listen gameplay

---

## §25 Postponed Systems

*(Added: 2026-05-23)*

Sistem berikut dipertimbangkan dan secara eksplisit ditunda. Jangan re-implement tanpa mereview alasan penundaan.

| System | Alasan penundaan |
|--------|-----------------|
| Note-name label overlay (SVG floating labels) | Renderer coupling (`getNoteElement` melanggar Layer 3 freeze) + enter-before-exit lifecycle conflict. Re-entry conditions di `engraving-standards.md §10.4` |
| Cross-system slur rendering | Tidak ada test data. Memerlukan dua half-arcs di system break boundaries. |
| Phrase-aware part segmentation | MVP menggunakan fixed `part_size_bars`. Custom part boundaries adalah future notation intelligence. |
| Enharmonic spelling awareness | music21 output C# di mana context mungkin prefer Db. Future notation intelligence. |
| Adaptive difficulty | Belum ada gameplay engine. Prerequisite: Checkpoint 2. |
| Student progress tracking | Belum ada persistence layer. Prerequisite: backend/storage design. |
| Voice 2+ rendering | music21 voice 2+ diwarnai dan di-skip. MVP: voice 1 only. |
| Audio clock sync | `_audioCtx.currentTime` vs `performance.now()` clock skew. Dampak rendah di MVP scale; fix sebelum pitch detection join. |