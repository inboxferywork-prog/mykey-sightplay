# Collection Registry Verification Report — Deliverable A

**Document:** `docs/song-library/collection_registry_verification.md`
**Status:** Verified — approved for Yamaha data additions
**Date:** 2026-06-01

---

## 1. Registry Location

```
songs/collections.json
```

Single file. No other registry files exist.

---

## 2. Current Schema

```json
{
  "version": 2,
  "providers": [ { "id", "name", "listed", "requiresAssignment" } ],
  "collections": [ { "id", "name", "provider", "listed", "order", "tags" } ]
}
```

### Provider fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Stable kebab-case slug. FK target for `collection.provider`. |
| `name` | string | yes | Admin display name. Not shown to students. |
| `listed` | boolean | yes | `false` = all collections from this provider hidden from public. |
| `requiresAssignment` | boolean | yes | `true` = teacher must assign; student cannot self-browse. |

### Collection fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Stable kebab-case slug. Referenced by `index.json collectionId`. Never changes after first use. |
| `name` | string | yes | Human-readable name shown in Song Browser. |
| `provider` | string | yes | FK into providers array. |
| `listed` | boolean | yes | `false` = collection hidden from public Song Browser. |
| `order` | integer | yes | Sort order in Song Browser. Lower = first. |
| `tags` | string[] | no | Collection-level tags inherited by member songs. |

---

## 3. Current Consumers

| Consumer | How it uses collections.json | Runtime? |
|----------|------------------------------|---------|
| `tools/update_song_index.py` | Lists it in the `excluded` set so it is not processed as a song file. Does NOT read its contents. | No |
| `song-manager.html` | Stores `collectionId` as a free-text field. Does NOT fetch or read `collections.json`. | No |
| Runtime (`index.html`, `src/*.js`) | No reference anywhere. | No |
| `authoring.html` | No reference anywhere. | No |

**Finding: `collections.json` has zero runtime consumers today.** It is read by no code. The Content Studio (authoring.html) will be its first consumer — populating the collection dropdown.

This means adding entries carries zero runtime risk. The file is purely declarative data; nothing breaks if entries are added.

---

## 4. Current Data

### Providers (3)

| ID | Name | listed | requiresAssignment |
|----|------|--------|-------------------|
| `public-domain` | Public Domain | true | false |
| `mykey` | MyKey Music Labs | true | false |
| `licensed` | Licensed Content | false | true |

**Yamaha: not present.**

### Collections (9)

| ID | Name | Provider | listed | order |
|----|------|----------|--------|-------|
| `standalone` | Standalone | mykey | true | 1 |
| `beyer-op101` | Beyer Op.101 | public-domain | true | 2 |
| `czerny-op599` | Czerny Op.599 | public-domain | true | 3 |
| `burgmuller-op100` | Burgmüller Op.100 | public-domain | true | 4 |
| `hanon` | Hanon — The Virtuoso Pianist | public-domain | true | 5 |
| `duvernoy-op176` | Duvernoy Op.176 | public-domain | true | 6 |
| `indonesian-folk` | Indonesian Folk Songs | public-domain | true | 7 |
| `balinese-folk` | Balinese Folk Songs | public-domain | true | 8 |
| `mykey-originals` | MyKey Originals | mykey | true | 9 |

**Yamaha collections: not present.**

---

## 5. Proposed Yamaha Additions

### New provider

```json
{
  "id": "yamaha",
  "name": "Yamaha Music Education",
  "listed": false,
  "requiresAssignment": true
}
```

- `listed: false` — Yamaha songs are excluded from the public Song Browser regardless of individual song `listed` status
- `requiresAssignment: true` — Yamaha songs are only accessible via teacher assignment

### New collections (5)

```json
{ "id": "yamaha-primary-1",   "name": "Yamaha Primary 1",   "provider": "yamaha", "listed": false, "order": 10, "tags": [] },
{ "id": "yamaha-primary-2",   "name": "Yamaha Primary 2",   "provider": "yamaha", "listed": false, "order": 11, "tags": [] },
{ "id": "yamaha-primary-3",   "name": "Yamaha Primary 3",   "provider": "yamaha", "listed": false, "order": 12, "tags": [] },
{ "id": "yamaha-primary-4",   "name": "Yamaha Primary 4",   "provider": "yamaha", "listed": false, "order": 13, "tags": [] },
{ "id": "yamaha-extension-2", "name": "Yamaha Extension 2", "provider": "yamaha", "listed": false, "order": 14, "tags": [] }
```

Song mapping:

| Song | Collection ID |
|------|---------------|
| Roti Panas | `yamaha-primary-1` |
| Burung Kuku | `yamaha-primary-2` |
| London Bridge | `yamaha-primary-3` |
| Si Kecil Sepatu Merah | `yamaha-primary-4` |
| A Cuckoo | `yamaha-extension-2` |

---

## 6. Compatibility Assessment

| Check | Result |
|-------|--------|
| Proposed entries match existing field schema | ✓ Pass |
| All required fields present in proposed entries | ✓ Pass |
| All `id` values are kebab-case unique slugs | ✓ Pass |
| `provider` FK value (`"yamaha"`) references the new provider being added | ✓ Pass |
| `order` values (10–14) do not conflict with existing entries (1–9) | ✓ Pass |
| No existing `collectionId` in index.json references a Yamaha ID | ✓ Pass — no songs currently assigned to Yamaha collections |
| Addition is purely additive — no existing entries modified | ✓ Pass |

---

## 7. Runtime Impact Assessment

| Concern | Assessment |
|---------|------------|
| Does any runtime code read collections.json? | No. Zero runtime consumers today. |
| Can adding entries break existing behavior? | No. The file is currently unused by any code. |
| Will the Content Studio dropdown show Yamaha correctly? | Yes — after addition, the dropdown will include all 5 Yamaha collections. |
| Does the `requiresAssignment: true` cascade activate immediately? | No. The cascade is enforced by `access.js` (not yet implemented). Setting it now is correct for future activation. |
| Will `listed: false` on the provider hide Yamaha from the Song Browser? | Yes — once the Song Browser is built, the cascade will apply automatically. Setting it now is correct. |

**Verdict: additions are safe, additive, and correct. Approved to modify.**
