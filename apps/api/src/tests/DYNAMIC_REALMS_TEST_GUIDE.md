# Dynamic Realms Testing Guide

This guide helps you verify that the dynamic realm system works correctly in a running environment.

## 🚀 Quick Test

### 1. Run Local Verification (No Docker Required)
```bash
# Run filesystem verification script
bun run apps/api/src/tests/verify-dynamic-realms.ts
```

This verifies:
- ✅ Realm scanning from `packages/realms/`
- ✅ Grimoire discovery from `packages/grimoires/`
- ✅ Custom UI view detection
- ✅ Realm manifest validation
- ✅ Admin registry building (simulated)

### 2. Start the API (For Full Testing)
```bash
docker compose up -d gremius_api
# or
pnpm --filter @gremius/api dev
```

## 🧪 Manual Testing Steps

### Test 1: Verify Realm Scanning

**Check:** Realms are dynamically discovered from `packages/realms/`

```bash
curl http://localhost:3001/api/modules | jq '.docs[] | select(.category == "realm") | {name, realmId, category}'
```

**Expected Output:**
```json
{
  "name": "Games",
  "realmId": "realm-esports",
  "category": "realm"
}
{
  "name": "Streamers",
  "realmId": "realm-esports",
  "category": "realm"
}
```

**Verify:** Each realm grimoire has `realmId` set and `canToggle: false`.

---

### Test 2: Verify Admin Registry

**Check:** Admin panel gets dynamic grimoire configs

```bash
# With authentication
curl -H "Cookie: your-auth-cookie" http://localhost:3001/api/admin/registry | jq '.[] | select(.category == "esports") | {id, name, category}'
```

**Expected Output:**
```json
{
  "id": "grimoire-games",
  "name": "Games",
  "category": "esports"
}
```

**Verify:**
- Realm grimoires have `category: "esports"`
- Standalone grimoires have `category: "core"`, `"content"`, or `"data"`
- Engine infrastructure (media-library) is NOT in the list

---

### Test 3: Verify Custom UI Detection

**Check:** Grimoires with custom views are properly detected

```bash
curl -H "Cookie: your-auth-cookie" http://localhost:3001/api/admin/registry | jq '.[] | select(.hasCustomView == true) | {id, name, views: [.views[] | select(.type == "custom")]}'
```

**Expected Output:**
```json
{
  "id": "grimoire-academy-lms",
  "name": "Academy LMS",
  "views": [
    {
      "id": "custom",
      "type": "custom",
      "component": "$views/academy/AcademyView.svelte"
    }
  ]
}
```

**Verify:**
- Academy → `academy/AcademyView.svelte`
- Formulas → `formulas/FormulasView.svelte`
- Blog → `content/PostsView.svelte`
- Games → `games/GamesView.svelte`

---

### Test 4: Verify Fallback to Grid Views

**Check:** Grimoires without custom views get grid views

```bash
curl -H "Cookie: your-auth-cookie" http://localhost:3001/api/admin/registry | jq '.[] | select(.hasCustomView == false) | {id, name, defaultView, views: [.views[].type]}'
```

**Expected Output:**
```json
{
  "id": "grimoire-booking",
  "name": "Booking Engine",
  "defaultView": "grid-rooms",
  "views": ["grid", "grid", "grid"]
}
```

**Verify:**
- No custom view → `hasCustomView: false`
- `defaultView` starts with `grid-`
- All views are type `grid`

---

### Test 5: Verify Sidebar Integration

**Check:** Admin panel sidebar shows grimoires in correct groups

1. Open http://localhost:3000/grimoires
2. Check that grimoires are grouped by category
3. Verify realm grimoires show under their realm name (e.g., "Esports")

**Expected Groups:**
- **Core Grimoires**: promote, blocks, formulas, webhooks, connectors, workers
- **Optional Features**: academy, blog, dms, booking, etc.
- **Esports**: games, streamers, platforms, etc.

---

### Test 6: Test Adding a New Realm (Full Dynamic Test)

**Step 1:** Create a new realm
```bash
mkdir -p packages/realms/realm-testrealm
cat > packages/realms/realm-testrealm/realm.json << 'EOF'
{
  "id": "realm-testrealm",
  "name": "Test Realm",
  "description": "A test realm for verifying dynamic loading",
  "version": "1.0.0",
  "type": "realm",
  "grimoires": [
    "grimoire-games"
  ]
}
EOF
```

**Step 2:** Restart API
```bash
docker compose restart gremius_api
```

**Step 3:** Verify new realm is detected
```bash
curl http://localhost:3001/api/modules | jq '.docs[] | select(.realmId == "realm-testrealm")'
```

**Expected:** The games grimoire should now show `realmId: "realm-testrealm"` when the test realm is active.

**Step 4:** Clean up
```bash
rm -rf packages/realms/realm-testrealm
```

---

### Test 7: Verify Core Mechanics Unchanged

**Check:** Non-realm grimoires still work correctly

```bash
# Core grimoires
curl http://localhost:3001/api/modules | jq '.docs[] | select(.category == "core") | .name'

# Optional grimoires
curl http://localhost:3001/api/modules | jq '.docs[] | select(.category == "optional" or .category == "content" or .category == "data") | .name'
```

**Expected:**
- Core: Promote, Blocks, Formulas, Webhooks, Connectors, Workers
- Optional: Academy, Blog, DMS, Booking, etc.

---

## 📊 Test Results Summary

After running all tests, you should see:

| Component | Status | Notes |
|-----------|--------|-------|
| Realm Scanning | ✅ | Realms auto-discovered from filesystem |
| Grimoire Discovery | ✅ | All grimoires found and categorized |
| Dynamic Categorization | ✅ | Realm grimoires → "esports" |
| Custom UI Detection | ✅ | Views detected for academy, blog, games, etc. |
| Grid View Fallback | ✅ | Non-custom grimoires get grid views |
| Sidebar Integration | ✅ | Groups by realm name dynamically |
| Core Mechanics | ✅ | Core and optional grimoires unchanged |

---

## 🐛 Troubleshooting

### Issue: Realms not appearing
**Check:** 
- Directory exists: `packages/realms/realm-*/`
- File exists: `realm.json` or `gremius.json`
- Valid JSON with `id`, `name`, `grimoires` fields

### Issue: Grimoires not in admin
**Check:**
- Grimoire exists in `packages/grimoires/`
- Has valid `grimoire.json`
- Not in `ENGINE_INFRASTRUCTURE` list

### Issue: Custom views not detected
**Check:**
- View file exists: `packages/admin/src/views/{grimoire}/{Name}View.svelte`
- File name matches pattern (PascalCase)

### Issue: 401 errors
**Check:**
- User is authenticated
- Cookie is being sent with requests
- Run tests with `credentials: "include"`

---

## ✅ Success Criteria

All tests pass if:
1. ✅ Realms are scanned dynamically from filesystem
2. ✅ Grimoires are categorized correctly (core/optional/esports)
3. ✅ Custom views are detected and paths are correct
4. ✅ Grid views work as fallback
5. ✅ Sidebar groups grimoires by realm
6. ✅ Core grimoires still work unchanged
7. ✅ No 401/500 errors in API responses
