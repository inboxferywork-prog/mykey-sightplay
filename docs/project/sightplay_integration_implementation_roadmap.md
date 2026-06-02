# SightPlay Integration Implementation Roadmap

## Phase 0 — Stabilization Freeze (Current)

Status: SEDANG BERJALAN

Target:
- Runtime stabil
- Renderer stabil
- Segment system stabil
- Practice Loop stabil

Jangan sentuh:
- RuntimeEngine
- NotationRenderer
- Learning Segment
- Practice Loop

---

## Phase 1 — Song Management Foundation

Target:
Song → Collection → Library

### Task
1. Collection Metadata
```json
{
  "collectionId": "beyer-op101",
  "collectionName": "Beyer Op.101"
}
```

2. Collection Registry
- songs/index.json
- collections/index.json

3. Update Song Index Builder
- update_song_index.py menghasilkan:
  - songs/index.json
  - collections/index.json

Deliverable:
- Collection model siap dipakai UI

---

## Phase 2 — Collection-Based Library

Target:
Sight Reading → Collection → Song

### Task
- Buat library browser
- Menampilkan daftar collection:
  - Beyer
  - Czerny
  - Burgmüller
  - Hanon

Deliverable:
- Collection Browser

---

## Phase 3 — Song Browser

Target:
Collection → Song

### Task
- Filter berdasarkan collectionId
- Menampilkan daftar lagu dalam collection

Deliverable:
- Song Browser

---

## Phase 4 — Launch Song From Library

Target:
Library → Song → Runtime

### Task
- Hubungkan songId ke Song Loader
- Tidak mengubah RuntimeEngine

Deliverable:
- Klik lagu langsung masuk latihan

---

## Phase 5 — MyKey Explore Integration

Target:
Explore → Sight Reading → Collection

### Task
- Update games.json
- Gunakan Collection sebagai subcategory

Deliverable:
- Collection muncul di Explore

---

## Phase 6 — Platform Adapter

Target:
SightPlay memakai platform MyKey yang sudah ada

### Reuse
- auth.js
- access.js
- teacher.js
- guest.js
- progress.js

### Task
- Adapter layer untuk SightPlay

Deliverable:
- Login
- Membership
- Assignment
- Referral

---

## Phase 7 — Assignment System

Target:
Teacher Assign Song

Flow:
Teacher → Assign → Song

Deliverable:
- Assignment link untuk lagu

---

## Phase 8 — Segment Progress System

Target:
Song → Segment → Practice Activity

Status:
- Not Started
- Explored
- Practicing
- Mastered

Contoh:

Beyer 37
- Segment A: Mastered
- Segment B: Practicing
- Segment C: Explored
- Segment D: Not Started

Deliverable:
- Progress per segment

---

## Phase 9 — Teacher Dashboard

Target:
Melihat perjalanan latihan murid

Data:
- Song Progress
- Segment Progress
- Most Practiced Segment
- Most Repeated Measures
- Practice Activity

Deliverable:
- Dashboard latihan murid

---

## Next Approved Task

Design Collection Model

Output:
- Collection metadata schema
- collections/index.json schema
- update_song_index.py update plan

Semua fase berikutnya bergantung pada Collection Model.
