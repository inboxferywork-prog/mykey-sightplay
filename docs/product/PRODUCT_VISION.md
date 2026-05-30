# MyKey Music Labs — Product Vision

**Document type:** Product identity and philosophy  
**Audience:** Product decisions, design reviews, feature evaluation  
**Relationship to SPEC.md:** This document sits above the technical specification. It describes *why* the product exists and *what it is trying to be*. SPEC.md describes *how* to build it.

---

## 1. What MyKey Is

MyKey Music Labs is a **guided piano learning platform**.

Its purpose is to help people learn to read and play real piano music — from first contact with the instrument through advanced development.

MyKey is not:
- a notation editor or score-writing tool
- a rhythm game or falling-note simulator
- a competitor to MuseScore, Sibelius, or Dorico as an engraving application

The distinction matters. Notation editors serve musicians who already know how to read music. MyKey serves people who are learning. The product's measure of success is whether a student can play a piece of music more fluently after using it — not whether the notation is pixel-perfect.

---

## 2. Target Users

MyKey is designed for piano learners of all ages: **ages 4 through 70+**, from beginner through advanced.

The current major user group is **ages 4–14**. Design decisions that affect this group carry the most immediate weight.

The product must also remain useful for:
- **Older learners** returning to piano or starting as adults
- **Teachers** who recommend or use the platform as a lesson companion
- **Parents** of young learners who monitor or participate in practice

No feature should be designed in a way that excludes any of these groups. The experience should feel age-appropriate for a child while remaining dignified for an adult.

---

## 3. Core Learning Philosophy

### Learning should feel active, not passive

Students learn to play by playing. The platform is not a lecture tool. Every interaction — watching, recognizing, attempting, succeeding — is part of the learning process.

### Engagement without exhaustion

Learning should feel active and productive without feeling heavy. The learner should be engaged in meaningful activity while experiencing the process as approachable, rewarding, and sustainable.

MyKey intentionally uses lightweight interactions, progressive challenges, and guided experiences to reduce perceived learning burden without reducing educational value. The aim is not to make learning easier — it is to make learning feel achievable so that students continue.

### Rhythm before speed

This is a reading trainer, not a performance simulator. A stable, slow tempo that a student can follow accurately is more valuable than a fast tempo that produces errors. The platform never forces tempo beyond what the learner can handle.

### Notation correctness matters

Students learn from what they see. Incorrect notation teaches incorrect habits. The visual representation of music should follow standard notation conventions, because the product is teaching music — not approximating it.

### Notation as foundation, not destination

The platform teaches sight reading and notation because they are foundational components of piano musicianship — not because notation reading is the goal in itself. A learner who can read music independently can approach new repertoire without guidance, continue developing at their own pace, and understand what they are playing rather than only how to play it.

The long-term educational aim is to help learners become more capable musicians. Sight reading is a means to that end.

---

## 4. Learning States

Learning States are a **core pillar of the product**. They are not interface modes; they are the teaching method itself.

The product is explicitly modeled after the way experienced piano teachers introduce and reinforce new material. An effective teacher does not hand a student a piece of music and expect immediate performance. They demonstrate first, then guide note identification without time pressure, then introduce tempo gradually. Learning States, segment-based progression, guided practice, and incrementally increasing challenge are all derived from this teaching logic — not from software conventions.

Each Learning State represents a distinct stage of this process:

**Explore** — The student watches and listens. The platform plays the music, highlighting notes in real time. No performance is required. The goal is familiarity before attempt.

**Recognize** — The student identifies and plays each note without time pressure. Hints are available but limited. The goal is accurate note identification.

**Sight Play** — The student plays in time with a moving timeline. The student follows the music; the music does not wait. The goal is reading notation while playing at tempo.

These three states are not interchangeable or skippable without reason. The sequence reflects a genuine learning arc: hear it, find it, play it in time. This is the arc a good teacher follows — and the arc the product is built around.

---

## 5. Segment-Based Learning

Songs are not treated as single monolithic units. A learner is not expected to confront an entire piece of music from the start and master it in one attempt.

Instead, songs are divided into smaller sections — typically a few bars each. Learners progress through these sections one at a time, developing competence at each step before advancing. Difficult passages can be isolated into shorter segments so a struggling learner does not lose confidence over a single hard measure. Progression gates ensure that a learner has genuinely understood a section before moving to the next.

This approach is not a content organization technique. It is a pedagogical position: that **competence is built incrementally**, that **shorter feedback loops produce faster progress**, and that **a learner who feels successful at small steps will persist through harder ones**.

Segment-based learning means the product is always teaching at the learner's current edge — not overwhelming, not trivial.

---

## 6. Game Systems

Game systems are **not a replacement for learning**. They exist to:
- validate what has been learned
- reinforce mastery through repetition that feels purposeful
- increase motivation to continue
- encourage completion of difficult segments

Appropriate mechanisms include: hints with graduated penalties, scoring, star ratings, practice streaks, achievement systems, and progression gates.

Game systems should always serve the learning outcome. A game mechanic that makes the experience feel fun but reduces musical understanding is a failure. A game mechanic that makes practice feel rewarding while reinforcing accurate note reading is a success.

---

## 7. Reading Experience and Orientation

MyKey supports two orientations with distinct purposes:

**Portrait** — A reading-oriented learning experience. The notation is the primary focus. The interface is reduced to what is necessary for reading and interacting with the score. This orientation prioritizes clarity and immersion in the music.

**Landscape** — A higher-clarity practice experience. More of the musical context is visible simultaneously. The piano keyboard is available. This orientation supports active practice and hand coordination.

Future game modes may use either orientation depending on their gameplay needs. Orientation decisions should not be frozen to these current defaults — they describe the current intent, not a permanent constraint.

---

## 8. What Makes MyKey Different

Most music applications for learners fall into one of two categories: they teach notation abstractly, or they bypass notation entirely (falling notes, colored keys). Neither teaches sight reading.

MyKey is built on a different premise:

**Real notation, from the beginning.** Students read actual printed music notation — clefs, key signatures, time signatures, accidentals, ties, beams. There are no simplified proxies. This means students are developing a transferable skill, not learning to play an application.

**Learning States guide the reading process.** Rather than presenting notation and expecting immediate performance, MyKey introduces notation through a structured sequence. Explore gives context. Recognize builds accuracy. Sight Play builds fluency. These stages are the product's pedagogical mechanism.

**Guided progression, not open-ended exploration.** The platform does not put students in front of a library and let them struggle. It organizes music into segments, controls what is expected at each step, and unlocks further material when readiness is demonstrated.

**Game systems validate, not replace.** Scoring, hints, and ratings are tools for reinforcing learning — not the point of the experience. The student's goal is to play the music, not to accumulate points.

Together, these elements produce an experience that is genuinely different from both traditional notation education and gamified rhythm applications.

---

## 9. Long-Term Direction

MyKey's long-term goal is to support learners across the full arc of piano development — from a child's first encounter with the instrument to advanced repertoire.

The current focus is the beginner-to-intermediate range, building the educational foundation: notation rendering, learning states, audio playback, and the structure of guided progression.

Future development will extend this foundation toward:
- Microphone-based pitch detection for real instrument input
- Adaptive difficulty that responds to demonstrated skill
- Student progress tracking across sessions and songs
- Teacher-facing tools for assigning and monitoring practice
- A growing song library spanning beginner through advanced levels

These directions are already embedded in the technical architecture. The platform is designed to grow into them rather than requiring structural change when they are built.

---

## 10. What This Document Is Not

This document does not define feature requirements, technical constraints, or implementation decisions. It defines the product's identity and the reasoning behind its educational approach.

When a feature decision is unclear, this document should help answer: *does this serve the learner's ability to read and play music, or does it serve something else?*

If the answer is something else, the feature needs a stronger justification.
