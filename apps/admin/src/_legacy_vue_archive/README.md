# ⚠️ Legacy Vue Archive

**DO NOT IMPORT** — These files are NOT part of the active SvelteKit build.

This folder contains the original Vue 3 components and views from before the migration to Svelte 5. They are kept **only as reference** for consulting internal logic during the remaining migration work.

## Structure

```
_legacy_vue_archive/
├── views/              # Vue views (now replaced by Svelte views)
│   ├── Games.vue       ← Full content preserved
│   ├── Posts.vue        ← Full content preserved
│   ├── Streamers.vue    ← Full content preserved
│   ├── PostCreate.vue   ← Full content preserved
│   ├── games/CollectionsList.vue  ← Full content preserved
│   ├── users/UserProfile.vue      ← Full content preserved
│   └── ... (stubs)      ← Placeholder reference
└── components/         # Vue components (replaced by $lib Svelte components)
    └── ... (stubs)      ← Placeholder reference
```

## When to delete

Once all Svelte 5 migrations are complete, delete this entire folder:

```bash
rm -rf apps/admin/src/_legacy_vue_archive
```
