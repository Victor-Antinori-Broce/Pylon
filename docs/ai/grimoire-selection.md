# Grimoire Selection Guide for AI Assistants

> **Purpose:** Rapid, zero-fluff decision aid for LLMs choosing between grimoires, datasets, and realms.  
> **Rule of thumb:** If a grimoire exists for the domain, install it. Only fall back to custom datasets for truly unique schemas.

---

## 1. Decision Table

| User Intent | Grimoire to Install | Fallback (Custom Dataset) |
|-------------|---------------------|---------------------------|
| "I want a blog / posts / articles / CMS" | `grimoire-blog` | `blog-posts` dataset |
| "I want CRM / deals / pipelines / sales" | `grimoire-crm` | `deals`, `contacts` datasets |
| "I want booking / reservations / rooms / calendar" | `grimoire-booking` | `bookings`, `rooms` datasets |
| "I want learning / courses / LMS / students / quizzes" | `grimoire-academy-lms` | `courses`, `lessons` datasets |
| "I want employee directory / org chart / HR" | `grimoire-directory` | `employees`, `departments` datasets |
| "I want game catalog / releases / platforms" | `grimoire-games` | `games`, `platforms` datasets |
| "I want tournaments / esports / brackets / teams" | `grimoire-esports` | `tournaments`, `matches` datasets |
| "I want document management / manuals / DMS" | `grimoire-dms` | `documents`, `categories` datasets |
| "I want agile / sprints / issues / kanban" | `grimoire-agile` | `issues`, `sprints` datasets |
| "I want media library / uploads / assets" | `grimoire-media` | `media` dataset |
| "I want accounting / ledger / double-entry" | `grimoire-conta` | `transactions`, `accounts` datasets |
| "I want streamer tracking / live status" | `grimoire-streamers` | `streamers` dataset |
| "I want custom data structure / no standard domain" | — | Create dataset via `gremius_create_dataset` |

---

## 2. Grimoire Capability Matrix

| Grimoire | Auth Required | Has Admin UI | Has Relations | Has Workflows | Media Support |
|----------|---------------|--------------|---------------|---------------|---------------|
| `grimoire-blog` | Optional | ✅ | ✅ (tags, authors) | ✅ (publish/draft) | ✅ (grimoire-media) |
| `grimoire-crm` | Yes | ✅ | ✅ (contacts↔deals) | ✅ (pipeline) | ❌ |
| `grimoire-booking` | Yes | ✅ | ✅ (rooms↔bookings) | ✅ (conflict detection) | ❌ |
| `grimoire-academy-lms` | Yes | ✅ | ✅ (courses↔modules↔quizzes) | ✅ (progress) | ✅ |
| `grimoire-directory` | Yes | ✅ | ✅ (dept↔employee) | ❌ | ✅ (avatars) |
| `grimoire-games` | No | ✅ | ✅ (games↔platforms↔tags) | ❌ | ✅ (grimoire-media) |
| `grimoire-esports` | Yes | ✅ | ✅ (teams↔tournaments↔matches) | ✅ (brackets) | ❌ |
| `grimoire-dms` | Yes | ✅ | ✅ (docs↔categories↔versions) | ✅ (approval) | ✅ |
| `grimoire-agile` | Yes | ✅ | ✅ (issues↔sprints↔epics) | ✅ (triage) | ❌ |
| `grimoire-media` | No | ✅ | ❌ | ❌ | N/A (it IS media) |
| `grimoire-conta` | Yes | ✅ | ✅ (accounts↔entries) | ✅ (templates) | ❌ |
| `grimoire-streamers` | No | ✅ | ✅ (streamer↔platforms) | ✅ (live sync) | ✅ |

---

## 3. Realm vs Individual Grimoires

A **Realm** is a pre-packaged ecosystem of grimoires + configuration for a specific vertical. Use a realm when the user wants a turnkey solution; install individual grimoires when the user wants to cherry-pick features.

### When to recommend a Realm

| User Need | Realm | Included Grimoires |
|-----------|-------|-------------------|
| "I want a full gaming site" | `realm-default` or `gremius-cms-realm` | games, esports, streamers, media, blog |
| "I want a corporate intranet" | `realm-corporate` | directory, dms, blog, booking, crm |
| "I want a SharePoint-like portal" | `realm-sharepoint` | dms, directory, blog, media |

### Realm advantages
1. **Pre-configured auth** — OAuth providers, default roles, and RLS policies are set up automatically.
2. **Cross-grimoire relations** — A realm guarantees compatible foreign keys and shared datasets (e.g., `grimoire-media` linked from blog, games, and directory).
3. **Single seed command** — `gremius realm activate <realm>` installs all grimoires and runs seed SQL in the correct order.
4. **Unified admin navigation** — The admin UI shows a coherent sidebar instead of disconnected modules.

### When to recommend individual Grimoires
1. The user already has a backend and wants **one extra feature** (e.g., "just add a blog").
2. The user wants to **avoid bloat** (e.g., a simple landing page that only needs `grimoire-media`).
3. The user is **building a custom realm** and wants to compose their own set.

---

## 4. Dependency Chain

Some grimoires depend on others. Always install dependencies first.

```
grimoire-games      → requires grimoire-media
grimoire-directory  → optional grimoire-media (avatars)
grimoire-blog       → optional grimoire-media (featured images)
grimoire-academy-lms → optional grimoire-media (course covers)
grimoire-dms        → optional grimoire-media (file attachments)
```

If the user installs a grimoire and you see a "missing dependency" error, install the upstream grimoire first, then retry.

---

## 5. Quick Decision Flowchart

```
User describes a need
│
├─ Is it a well-known domain with a grimoire?
│   ├─ YES → Install grimoire (check dependencies first)
│   │         └─ Does the user want a full turnkey vertical?
│   │            ├─ YES → Recommend a Realm
│   │            └─ NO  → Install individual grimoire
│   └─ NO  → Create custom dataset
│
└─ Does the user mention multiple unrelated domains?
      └─ YES → Recommend a Realm or install grimoires one by one
```
