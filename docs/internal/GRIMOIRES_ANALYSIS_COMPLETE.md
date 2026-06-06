# Complete Grimoires Analysis & Migration Strategy

**Date**: 2026-03-15  
**Status**: AI Memories migrated to Core — Analysis of remaining 18 grimoires

---

## 📊 Grimoires Inventory (19 Total)

### ✅ Already Migrated to Core

| #   | Grimoire    | New Location                   | Type      |
| --- | ----------- | ------------------------------ | --------- |
| 1   | AI Memories | `packages/core/vector-search/` | Extension |

---

### 🟢 Capabilities → Move to Core (4 grimoires)

These should become **Dataset Extensions** available on any dataset:

| #   | Grimoire        | Reason                              | New Core Module              |
| --- | --------------- | ----------------------------------- | ---------------------------- |
| 2   | **Formulas**    | Calculated fields needed everywhere | `packages/core/formulas/`    |
| 3   | **Tags**        | Taxonomy system universal           | `packages/core/taxonomy/`    |
| 4   | **Promote**     | Publishing workflow universal       | `packages/core/publishing/`  |
| 5   | **Collections** | Grouping items universal            | `packages/core/collections/` |

#### Migration Path

```typescript
// Before: Install grimoire
// After: Dataset extension
{
  name: "products",
  extensions: {
    formulas: { fields: [...] },
    taxonomy: { tags: true },
    publishing: { enabled: true },
    collections: { enabled: true }
  }
}
```

---

### 🟡 Domain Modules → Keep as Modules (6 grimoires)

These are **legitimate vertical domains** with complex business logic:

| #   | Grimoire        | Tables                                                       | Complexity | Decision          |
| --- | --------------- | ------------------------------------------------------------ | ---------- | ----------------- |
| 6   | **Academy LMS** | 8+ tables (courses, lessons, quizzes, enrollments, etc.)     | ⭐⭐⭐⭐⭐ | ✅ Keep as Module |
| 7   | **CRM**         | 6 tables (contacts, companies, deals, pipelines, activities) | ⭐⭐⭐⭐   | ✅ Keep as Module |
| 8   | **Booking**     | 3 tables (rooms, reservations, amenities)                    | ⭐⭐⭐     | ✅ Keep as Module |
| 9   | **DMS**         | 3+ tables (documents, versions, permissions)                 | ⭐⭐⭐     | ✅ Keep as Module |
| 10  | **Directory**   | 2 tables (listings, categories)                              | ⭐⭐       | ✅ Keep as Module |
| 11  | **Blocks**      | Page builder components                                      | ⭐⭐⭐     | ⚠️ Partial Core   |

#### Recommended Structure

```
packages/modules/
├── academy/          # Full LMS (your best module)
├── crm/              # Sales pipeline
├── booking/          # Reservations
├── documents/        # DMS
├── directory/        # Listings
└── blocks/           # Page builder (core UI?)
```

---

### 🟠 Gaming-Specific → Consolidate or Remove (8 grimoires)

These are **specific to gaming/esports** use case. As a general BaaS, they shouldn't be core:

| #   | Grimoire        | Purpose                         | Recommendation                               |
| --- | --------------- | ------------------------------- | -------------------------------------------- |
| 12  | **Games**       | Game catalog                    | Consolidate → `modules/gaming/` OR Remove    |
| 13  | **Platforms**   | Gaming platforms (PC, PS, Xbox) | Consolidate → `modules/gaming/` OR Remove    |
| 14  | **Players**     | Player profiles                 | Consolidate → `modules/esports/` OR Remove   |
| 15  | **Teams**       | Esports teams                   | Consolidate → `modules/esports/`             |
| 16  | **Matches**     | Game matches                    | Consolidate → `modules/esports/`             |
| 17  | **Tournaments** | Tournament brackets             | Consolidate → `modules/esports/`             |
| 18  | **Streamers**   | Content creators                | Consolidate → `modules/esports/` OR Remove   |
| 19  | **Blog**        | Content publishing              | ❌ Remove — redundant with Promote + Dataset |

#### Consolidation Strategy

**Option A: Keep Gaming Focus** (if Gremius targets gaming BaaS)

```
packages/modules/
├── gaming-suite/     # Games + Platforms + Collections
└── esports-suite/    # Players + Teams + Matches + Tournaments + Streamers
```

**Option B: General BaaS** (recommended)

```
# Remove these, users create datasets manually:
# - Games → Dataset "games"
# - Platforms → Dataset "platforms"
# - Players → Dataset "players"
# etc.

# Only keep:
packages/modules/
├── academy/
├── crm/
├── booking/
└── documents/
```

---

## 🔍 Detailed Analysis

### Why Formulas Should Be Core

**Current State**: Grimoire with separate `formulas` table  
**Problem**: User must install grimoire + create formula records + link to dataset  
**Better**: Virtual field type in dataset schema

```typescript
// Current (complex)
// 1. Install grimoire-formulas
// 2. POST /api/formulas { name: "total", expression: "..." }
// 3. Reference in dataset somehow

// Proposed (simple)
{
  name: "orders",
  fields: [
    { name: "price", type: "number" },
    { name: "quantity", type: "number" },
    {
      name: "total",
      type: "formula",
      formula: "price * quantity * (1 - discountRate)",
      dependencies: ["price", "quantity"]
    }
  ]
}
// Auto-available in API, Admin, GraphQL
```

---

### Why Tags Should Be Core

**Current State**: Separate `tags` table, manual linking  
**Better**: Field type `tags` with built-in taxonomy

```typescript
{
  name: "posts",
  fields: [
    { name: "title", type: "text" },
    {
      name: "categories",
      type: "tags",
      taxonomy: "blog-categories", // Shared vocab
      allowNew: true // Can create new tags
    }
  ]
}
// Auto: /api/datasets/posts?tags=technology
```

---

### Why Promote Should Be Core

**Current State**: Separate endpoint `/api/promote`  
**Better**: Publishing extension on any dataset

```typescript
{
  name: "products",
  fields: [...],
  extensions: {
    publishing: {
      enabled: true,
      slugField: "name",
      route: "/products/:slug",
      seoFields: ["description", "image"],
      statusField: "isPublished"
    }
  }
}
// Auto: /api/content/products/:slug (public)
//       /api/datasets/products/:id/publish
```

---

### Why Blog Should Be Removed

**Current**: Dedicated grimoire with hardcoded tables  
**Problem**: Redundant with flexible datasets + publishing

**Replacement**:

```typescript
// User creates dataset
POST /api/datasets
{
  name: "posts",
  fields: [
    { name: "title", type: "text", required: true },
    { name: "slug", type: "slug", source: "title" },
    { name: "content", type: "richtext" },
    { name: "excerpt", type: "textarea" },
    { name: "featuredImage", type: "image" },
    { name: "publishedAt", type: "datetime" },
    { name: "tags", type: "tags", taxonomy: "blog-tags" }
  ],
  extensions: {
    publishing: { enabled: true, slugField: "slug" }
  }
}

// More flexible than hardcoded blog grimoire!
```

---

## 📋 Migration Priority Matrix

| Priority | Grimoire      | Effort  | Impact     | Action             |
| -------- | ------------- | ------- | ---------- | ------------------ |
| P0       | AI Memories   | ✅ Done | ⭐⭐⭐⭐⭐ | Migrated           |
| P1       | Formulas      | Medium  | ⭐⭐⭐⭐⭐ | Migrate to Core    |
| P1       | Tags          | Low     | ⭐⭐⭐⭐⭐ | Migrate to Core    |
| P1       | Promote       | Medium  | ⭐⭐⭐⭐   | Migrate to Core    |
| P2       | Collections   | Low     | ⭐⭐⭐     | Migrate to Core    |
| P2       | Blocks        | Medium  | ⭐⭐⭐     | Core UI Components |
| P3       | Gaming Suite  | High    | ⭐⭐       | Consolidate/Remove |
| P3       | Esports Suite | High    | ⭐⭐       | Consolidate/Remove |
| P4       | Blog          | Low     | ⭐         | Remove (redundant) |

---

## 🏗️ Target Architecture

### After Migration

```
gremius/
├── apps/
│   ├── api/                  # Core API
│   └── admin/                # Admin panel
│
├── packages/
│   ├── core/                 # ALWAYS ACTIVE
│   │   ├── database/         # Drizzle, migrations
│   │   ├── auth/             # Better Auth
│   │   ├── storage/          # MinIO/S3
│   │   ├── realtime/         # WebSockets
│   │   ├── vector-search/    # ✅ AI Memories migrated
│   │   ├── formulas/         # ⏳ Next
│   │   ├── taxonomy/         # ⏳ Tags next
│   │   ├── publishing/       # ⏳ Promote next
│   │   └── collections/      # ⏳ Later
│   │
│   ├── modules/              # OPT-IN (was grimoires/)
│   │   ├── academy/          # Keep
│   │   ├── crm/              # Keep
│   │   ├── booking/          # Keep
│   │   ├── documents/        # Keep
│   │   └── esports/          # Consolidated
│   │
│   └── starters/             # TEMPLATES
│       ├── blog/             # Dataset config
│       ├── e-commerce/       # Dataset config
│       └── gaming/           # Dataset config
│
└── docker/
```

---

## ✅ Implementation Checklist

### Phase 1: Core Extensions (P1)

- [ ] Migrate **Formulas** → `packages/core/formulas/`
- [ ] Migrate **Tags** → `packages/core/taxonomy/`
- [ ] Migrate **Promote** → `packages/core/publishing/`
- [ ] Create unified Extensions API in admin

### Phase 2: Cleanup (P2-P3)

- [ ] Consolidate Gaming grimoires
- [ ] Consolidate Esports grimoires
- [ ] Remove **Blog** grimoire
- [ ] Update documentation

### Phase 3: Starters (P4)

- [ ] Create `starters/blog/` template
- [ ] Create `starters/e-commerce/` template
- [ ] Migration guide for users

---

## 🎯 Benefits Summary

| Metric            | Before (Grimoires)                  | After (Core + Modules)             |
| ----------------- | ----------------------------------- | ---------------------------------- |
| Concepts to learn | 3 (Datasets, Grimoires, Extensions) | 2 (Datasets + Extensions, Modules) |
| API endpoints     | Scattered per grimoire              | Unified `/api/datasets/*`          |
| Setup complexity  | Install + configure + link          | Toggle extensions                  |
| Flexibility       | Limited to grimoire features        | Any dataset can use any extension  |
| Maintainability   | 19 separate packages                | ~5 core + ~5 modules               |

---

## Conclusion

**Verdict**:

- **5 Grimoires** → Core Extensions (Formulas, Tags, Promote, Collections, AI Memories ✅)
- **5 Grimoires** → Keep as Modules (Academy, CRM, Booking, DMS, Directory)
- **8 Grimoires** → Consolidate to 2 or Remove (Gaming/Esports)
- **1 Grimoire** → Remove (Blog — redundant)

This makes Gremius a true **BaaS platform** with clear separation:

- **Core**: Universal capabilities
- **Modules**: Optional vertical solutions
- **Starters**: Pre-built configurations
