# MyKey SightPlay Integration Roadmap

## Product Experience & Content Scalability Update

Status: Approved Direction
Owner: Project Owner
Architecture Advisor: ChatGPT
Implementation Engineer: Claude

---

# 1. Background

Awalnya SightPlay dikembangkan sebagai aplikasi standalone untuk latihan sight reading piano.

Seiring perkembangan Runtime Engine, Engraver, Learning Segments, Practice Loop, dan Song Management, SightPlay berkembang menjadi platform pembelajaran lagu yang berbeda secara fundamental dari engine game Note Reading yang digunakan di MyKey Music Labs.

Dokumen ini menetapkan arah integrasi SightPlay ke MyKey Music Labs tanpa mengorbankan arsitektur yang sudah stabil.

---

# 2. Product Positioning

## Note Reading

Tujuan:

* Belajar membaca notasi
* Drill recognition
* Game-based learning

Struktur:

Explore
→ Note Reading
→ Sub Category
→ Game

Contoh:

Explore
→ Note Reading
→ Basic Treble
→ Step Notes 01

---

## Sight Reading

Tujuan:

* Membaca lagu nyata
* Practice-based learning
* Companion App untuk latihan rumah

Struktur:

Explore
→ Sight Reading
→ Collection / Book
→ Song
→ Segment Practice

Contoh:

Explore
→ Sight Reading
→ Beyer Op.101
→ Exercise 37
→ Segment A

---

# 3. Architectural Decision

## Decision A

SightPlay tetap berada di:

apps/sightplay/

dan tidak dijalankan melalui:

games/play.html

Runtime SightPlay tetap independen.

---

## Decision B

MyKey Explore tetap menjadi portal utama.

User tidak boleh merasa berpindah website.

Visual identity tetap:

MyKey Music Labs

tetapi runtime dapat berbeda.

---

## Decision C

Explore Games tidak menampilkan seluruh lagu.

Explore hanya menampilkan Collection.

Contoh:

Sight Reading
→ Beyer
→ Czerny
→ Burgmüller
→ Hanon

Bukan:

Sight Reading
→ Exercise 1
→ Exercise 2
→ Exercise 3

---

# 4. Content Hierarchy

Struktur resmi:

Category
→ Collection
→ Song
→ Segment

Contoh:

Sight Reading
→ Beyer Op.101
→ Exercise 37
→ Segment B

---

# 5. Collection Model

Metadata baru:

```json
{
  "collectionId": "beyer-op101",
  "collectionName": "Beyer Op.101"
}
```

Collection menjadi entitas resmi.

Collection bukan sekadar folder.

---

# 6. Public vs Assignment Content

## Listed

Public Domain

Contoh:

* Beyer
* Czerny
* Burgmüller
* Hanon
* Duvernoy

Muncul di Explore.

---

## Unlisted

Teacher Assignment Only

Contoh:

* Yamaha
* Suzuki
* Alfred
* Faber

Tidak muncul di Explore publik.

Tetap dapat diakses melalui assignment link.

---

# 7. Platform Foundation

Hasil audit menunjukkan platform foundation sebagian besar sudah tersedia.

Modul yang telah ada:

* auth.js
* access.js
* teacher.js
* guest.js
* progress.js

Arah pengembangan:

Jangan membuat platform baru.

Gunakan dan perluas platform yang sudah ada.

---

# 8. Future Generalization

Terminologi jangka panjang:

gameId
→ contentId

assignedGames
→ assignedContent

Tujuan:

Platform dapat melayani:

* Game
* Song
* Exercise
* Assignment

tanpa duplikasi sistem.

---

# 9. SightPlay Progress System

Progress SightPlay tidak menggunakan model stars atau level seperti Note Reading.

Progress utama adalah:

Student
→ Song
→ Segment
→ Practice Activity

---

## Segment Status

Status resmi:

* Not Started
* Explored
* Practicing
* Mastered

---

## Song Progress Example

Beyer 37

Segment A
✓ Mastered

Segment B
◐ Practicing

Segment C
✓ Explored

Segment D
○ Not Started

---

# 10. Teacher Dashboard Vision

Tujuan utama:

Memberikan informasi latihan nyata kepada guru.

Bukan sekadar skor.

Guru harus dapat melihat:

* Lagu yang sedang dipelajari
* Segment yang sudah dibuka
* Segment yang sedang dilatih
* Segment yang sudah dikuasai
* Bagian yang sering diulang
* Aktivitas latihan murid

---

Contoh:

Student:
Andi

Song:
Beyer 37

Assigned:
Segment A

Activity:

Segment A
✓ Mastered

Segment B
✓ Explored

Segment C
✓ Explored

Guru langsung mengetahui bahwa murid melanjutkan latihan melebihi target.

---

# 11. Problem Area Tracking

Selain segment progress, sistem dapat menyimpan:

* Measure yang sering diulang
* Measure yang sering gagal
* Practice Loop yang sering digunakan

Contoh:

Segment B

Measure 11
Measure 12
Measure 13

Practice Loop:
28 kali

Informasi ini lebih berguna bagi guru dibanding sekadar skor.

---

# 12. Roadmap Priority

Current Priority:

1. Song Management Foundation
2. Collection Model
3. SightPlay Library
4. Explore Integration
5. Song Browser
6. Assignment Integration
7. Teacher Dashboard
8. Progress Analytics

---

# 13. Architecture Freeze

Tidak mengubah:

* Runtime Engine
* Notation Renderer
* Practice Loop Architecture
* Learning Segment Architecture
* Song Schema Core

Fokus saat ini hanya pada:

Product Experience
Content Scalability
Song Management
Website Integration
