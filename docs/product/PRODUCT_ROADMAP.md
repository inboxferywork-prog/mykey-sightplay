# MyKey Music Labs — Product Roadmap

**Document type:** Product planning  
**Audience:** Product decisions, prioritization reviews, development planning  
**Relationship to other documents:** This document describes *when* and *in what order* the product will be built. PRODUCT_VISION.md describes *what* the product is. SPEC.md describes *how* to build it.

---

## Product Layer Model

Before phases, it helps to name the distinct product concerns that the roadmap builds toward. These are separate layers with separate purposes and should not be collapsed into a single concept.

**Teaching Layer** — how the product delivers learning  
Learning States (Explore, Recognize, Sight Play), segment-based progression, guided practice, and hand/clef filtering. This layer is what makes MyKey a learning platform rather than a notation viewer or a game.

**Assessment Layer** — how the product measures and communicates learning  
Challenge validation, mastery tracking, report generation, and certificate workflows. This layer is what makes practice accountable and visible — to the learner, to the teacher, and to the parent.

**Motivation Layer** — how the product sustains engagement over time  
Stars, achievement systems, unlock gates, and progression rewards. This layer supports the Teaching and Assessment layers by making continued effort feel purposeful and rewarding.

These layers are built in the order listed. Motivation systems built before a solid Teaching Layer would gamify the wrong things. Assessment without a Teaching Layer has nothing to measure.

---

## Phase 1 — Stabilization and Product Shaping

**Current phase.**

The foundation of the platform is being established and refined. The primary deliverable of this phase is a stable, readable, and usable reading experience on real devices.

Focus areas:
- Notation renderer correctness and stability (grand staff, accidentals, ties, beams, slurs, staccato)
- Portrait reading mode: floating card layout, guidance strip, note name display
- Landscape practice mode: keyboard visibility, layout clarity
- Mobile UX refinement: touch targets, FAB overlay controls, orientation handling
- Renderer visual quality: grand staff spacing, system breathing room, barline completeness
- Content pipeline: song authoring workflow, segment editor, song index tooling

This phase ends when the reading experience is stable enough that new content can be added without requiring renderer changes, and the mobile layout works comfortably on real devices.

**What this phase does not include:** gameplay, scoring, or microphone input.

---

## Phase 2 — Song Management

The platform currently works with a small set of test songs. Phase 2 makes the song library a real product surface.

Focus areas:
- Song browser: cover display, level indication, metadata (composer, style, length)
- Continue learning: return a student to where they left off in a song
- Favorites and recent songs
- Content organization: levels, collections, playlists
- Scalability: the content pipeline must support a growing library without breaking existing songs

**Goal of this phase:** A student can find a song appropriate to their level, start learning it, and return to it in a subsequent session without losing their place.

---

## Phase 3 — Learning Journey

Phase 2 makes content discoverable. Phase 3 makes progression visible and guided.

Focus areas:
- Per-song learning continuity: the product knows which segments a student has completed and at what level
- Progression visibility: the student can see where they are in a song and in the broader library
- Guided advancement: the platform suggests what to practice next rather than requiring the student to navigate independently
- Unlock gates: later segments of a song become available as earlier ones are completed

**Goal of this phase:** A student can open the platform, see clearly where they are, and always know what to do next. The platform guides the learning path rather than presenting an open library.

---

## Phase 4 — Learning and Assessment System

This phase activates the Assessment Layer. It requires that the Teaching Layer (Phase 3) is stable, because assessment measures what teaching has delivered.

Focus areas:
- Challenge validation: the platform can evaluate whether a student played a segment correctly, at tempo, with appropriate accuracy
- Mastery tracking: per-segment, per-song, and per-level mastery is recorded over time
- Report generation: a student (or teacher, or parent) can view a summary of what has been learned
- Certificate workflow: completion of a level or a curriculum milestone can be acknowledged formally

**Goal of this phase:** Practice sessions have a verifiable outcome. A student, teacher, or parent can answer the question "what has this student actually learned?" with evidence from the platform.

---

## Phase 5 — Teacher and Parent Ecosystem

Phases 1–4 serve the learner directly. Phase 5 connects the learner's progress to the people around them.

Focus areas:
- Assignment workflows: a teacher can assign specific songs or segments to a student
- Progress sharing: a student or teacher can share a progress summary
- Monitoring: a parent or teacher can review recent activity without sitting next to the student
- Session history: the platform records what was practiced and for how long

**Goal of this phase:** MyKey functions as a lesson companion. A teacher using MyKey in lessons can assign follow-up practice and review results before the next session.

---

## Phase 6 — Motivation Systems

The Motivation Layer is built after the Teaching and Assessment layers are in place, because motivation systems need something real to reward. Stars awarded for completing notation exercises mean more once those exercises have been validated against actual performance.

Focus areas:
- Stars and ratings: per-segment and per-song performance indicators
- Achievements: recognizing milestones in learning (first song completed, first level mastered, practice streak)
- Unlock systems: new content, visual customization, or practice modes unlocked through demonstrated progress
- Progression rewards: markers that a learner has advanced to a new stage in their development

**Constraint:** Motivation systems must support the Teaching and Assessment layers, not substitute for them. A motivation mechanic that can be satisfied without genuine musical learning is a product failure.

---

## Deferred Items

The following are not prioritized in the current roadmap. They are documented here so that future contributors understand they have been considered and intentionally deferred.

**Runtime architecture rewrite**  
The RuntimeEngine is stable and frozen. It correctly handles playback, tempo scaling, seeking, part scoping, and event dispatch. There is no evidence of a limitation that requires a rewrite. A rewrite now would consume development time without advancing any user-facing capability. If a specific capability gap is identified that cannot be addressed within the current contract, that should be documented and evaluated at that time.

**Renderer architecture rewrite**  
The notation renderer uses VexFlow 5.0.0 and has been refined through many sessions to a stable, correct state. The engraving standards document covers known limitations and their status. A renderer rewrite is not warranted unless a fundamental limitation is reached that cannot be addressed through the existing refinement approach. Renderer improvements should continue as targeted, scoped changes rather than architectural rebuilds.

**Full architecture redesign**  
The current engine boundary model — RuntimeEngine, NotationRenderer, ViewportManager, and the one-way callback flow — is correct and clean. There are no known structural deficiencies. Redesign should only be considered if a new product requirement clearly cannot be met within the current model, not as a preventive measure.

The general principle: systems that are working should be extended, not rewritten. Development time is better spent advancing toward the phases above.

---

## Roadmap Summary

| Phase | Focus | Layer |
|---|---|---|
| 1 — Stabilization | Reading experience, renderer, mobile UX | Foundation |
| 2 — Song Management | Library, discovery, content scalability | Foundation |
| 3 — Learning Journey | Progression visibility, guided advancement | Teaching |
| 4 — Assessment System | Validation, mastery, reports, certificates | Assessment |
| 5 — Teacher / Parent | Assignments, sharing, monitoring | Assessment |
| 6 — Motivation Systems | Stars, achievements, unlocks, rewards | Motivation |
