# MyKey Music Labs — Decision Log

**Document type:** Product decision record  
**Audience:** Product, design, and engineering contributors  
**Purpose:** Preserve the reasoning behind major decisions so that future contributors understand not only *what* was decided but *why*. This is not a changelog and not a development log. It records decisions that affect product direction, educational philosophy, architecture boundaries, or major UX principles.

---

## Format

```
Date:      YYYY-MM-DD
Decision:  One clear statement of what was decided.
Reason:    Why this decision was made.
Status:    Active | Frozen | Superseded
```

**Active** — in effect; should guide current decisions.  
**Frozen** — in effect and not open for revision without a formal decision entry.  
**Superseded** — replaced by a later entry; preserved for context.

---

## Product Identity

---

**Date:** 2026-05-17  
**Decision:** MyKey Music Labs is defined as a guided piano learning platform.  
**Reason:** Prevents feature creep and misaligned priorities. The platform serves people who are learning to read and play music — not musicians who already know how, and not players who want a game. Every product decision should be evaluated against this identity. Named non-goals: rhythm game, falling-note simulator, notation editor, engraving application.  
**Status:** Frozen

---

**Date:** 2026-05-30  
**Decision:** Real music notation is a foundation for musicianship, not the destination.  
**Reason:** Without this clarification, the product risks being interpreted as a notation drill tool. Notation reading is taught because it enables independent musical development — the ability to approach new repertoire, understand what is being played, and continue learning without outside guidance.  
**Status:** Active

---

**Date:** 2026-05-30  
**Decision:** Piano musicianship is the long-term educational goal, not notation compliance.  
**Reason:** Establishes that the Teaching, Assessment, and Motivation layers all serve musical development. A student who can pass notation exercises but cannot play with understanding has not met the product's educational goal.  
**Status:** Active

---

**Date:** 2026-05-30  
**Decision:** MyKey is designed as a home practice companion that supports piano instruction rather than replacing it.  
**Reason:** The product originated from observing a common lesson problem: students often return to lessons without understanding how to practice their assigned material independently. Many struggle with note recognition, orientation within a piece, and effective home practice. As a result, valuable lesson time is frequently spent re-establishing note reading and familiarity with the material instead of focusing on higher-level musical development. MyKey exists to help learners prepare between lessons through guided learning, structured practice, assessment, and feedback. The intended outcome is that lesson time can be used more effectively for musical expression, interpretation, technique, artistry, and broader musicianship development. The platform is intended to strengthen the teacher-student learning relationship, not replace it.  
**Status:** Frozen

---

## Teaching Layer

---

**Date:** 2026-05-17  
**Decision:** Learning States (Explore, Recognize, Sight Play) are a core product pillar, not UI modes.  
**Reason:** Each state is a distinct stage in a structured teaching arc, modeled on how experienced piano teachers introduce material. Explore: watch and listen before attempting. Recognize: find notes accurately without time pressure. Sight Play: read at tempo. The sequence is pedagogically motivated and should not be skipped or reordered without justification.  
**Status:** Frozen

---

**Date:** 2026-05-17  
**Decision:** Segment-based learning is preferred over full-song-first learning.  
**Reason:** Songs are divided into smaller sections. Shorter feedback loops produce faster visible progress. Learners who feel successful at small steps persist through harder material. Progression gates ensure a learner has understood a section before advancing. This mirrors standard piano pedagogy and is part of the product's educational model, not merely a content organization choice.  
**Status:** Active

---

**Date:** 2026-05-17  
**Decision:** Teaching flow is derived from teacher-guided instruction principles, not software conventions.  
**Reason:** An experienced teacher demonstrates before asking for performance, guides note identification without time pressure, then introduces tempo gradually. The platform's feature sequence — Learning States, segment progression, guided practice, incrementally increasing challenge — reflects this logic. Features that bypass this sequence should carry a clear pedagogical justification.  
**Status:** Active

---

## Assessment Layer

---

**Date:** 2026-05-30  
**Decision:** Reports belong to the Assessment Layer and are separate from the Motivation Layer.  
**Reason:** Progress reports provide evidence of learning. Mixing reporting with motivation mechanics (stars, rewards) conflates measurement with encouragement, which can distort both. A report should reflect what a student has actually demonstrated, not how engaged they felt.  
**Status:** Active

---

**Date:** 2026-05-30  
**Decision:** Certificates belong to the Assessment Layer and mark demonstrated mastery, not participation.  
**Reason:** A certificate awarded for effort rather than demonstrated competence loses its value as evidence of learning. Certificates are Assessment outputs; they are not Motivation rewards.  
**Status:** Active

---

**Date:** 2026-05-30  
**Decision:** The Assessment Layer exists to provide verifiable evidence of learning outcomes.  
**Reason:** Without assessment, practice sessions have no verifiable outcome. Students, teachers, and parents cannot answer "what has this student actually learned?" The Assessment Layer makes learning visible and accountable.  
**Status:** Active

---

## Motivation Layer

---

**Date:** 2026-05-17  
**Decision:** Motivation systems support learning and must not replace it.  
**Reason:** Stars, achievements, unlocks, and progression rewards exist to validate, reinforce mastery, and sustain engagement. A motivation mechanic that can be satisfied without genuine musical learning is a product failure. Motivation systems are built after the Teaching and Assessment layers are stable, because they need something real to reward.  
**Status:** Active

---

**Date:** 2026-05-17  
**Decision:** Motivation systems are sequenced after Teaching and Assessment in the product roadmap.  
**Reason:** Stars for completing a segment mean more once that completion has been validated against actual performance. Building motivation mechanics before the teaching structure is in place risks rewarding the wrong behaviors.  
**Status:** Active

---

## UX Principles

---

**Date:** 2026-05-29  
**Decision:** Reading comfort takes priority over notation density.  
**Reason:** Dense, cramped notation increases cognitive load and reduces note recognition accuracy — especially for the primary user group (ages 4–14). Grand staff spacing, system breathing room, and visual clarity are treated as primary constraints in rendering decisions, not secondary preferences. The renderer is a reading experience, not a data display.  
**Status:** Active

---

**Date:** 2026-05-29  
**Decision:** Portrait mode is primarily a reading-oriented learning experience.  
**Reason:** A narrower viewport requires the interface to step back so notation can be the focus. The floating card layout, guidance strip, and suppressed keyboard in portrait are all oriented toward immersive score reading. Portrait UX decisions should preserve this reading-first character.  
**Status:** Active

---

**Date:** 2026-05-29  
**Decision:** Landscape mode is primarily a practice experience with keyboard visibility (current direction, not frozen).  
**Reason:** The wider viewport accommodates the piano keyboard and allows more horizontal notation context simultaneously. This supports hand coordination and active practice. Future game modes may use either orientation depending on gameplay needs — this decision describes current intent, not a permanent constraint.  
**Status:** Active

---

## Architecture

---

**Date:** 2026-05-17  
**Decision:** RuntimeEngine is the single authority for timeline playback, event dispatch, and temporal state.  
**Reason:** A single timeline authority prevents timing drift, event ordering conflicts, and race conditions between engines. No other engine may advance the playhead or drive timing independently. All systems consume runtime events; none produce them. This is foundational to the reliability of all gameplay, assessment, and audio synchronization that will be built on top of it.  
**Status:** Frozen

---

**Date:** 2026-05-23  
**Decision:** Engine boundaries are fixed: RuntimeEngine, NotationRenderer, ViewportManager, and the one-way callback flow are stable and frozen.  
**Reason:** The current architecture correctly separates concerns: timeline authority, visual rendering, viewport management, and UI orchestration are independent. Each engine has a single owner. No cross-engine state mutation is permitted. This structure supports all planned roadmap phases without requiring change.  
**Status:** Frozen

---

**Date:** 2026-05-30  
**Decision:** Runtime, renderer, and architecture rewrites are intentionally deferred and not prioritized.  
**Reason:** Existing systems are working and support the planned roadmap. Rewrites consume development time without advancing user-facing capability. A rewrite should only be initiated when a specific, documented capability gap cannot be addressed within the current design — not as a preventive measure or in response to theoretical future complexity.  
**Status:** Active
