# Dynamic Grimoires Testing Guide

This guide helps you verify that the dynamic grimoire system works correctly in a running environment.

## 🚀 Quick Test

### 1. Run Local Verification (No Docker Required)

```bash
# Run filesystem verification script
bun run apps/api/src/tests/verify-dynamic-grimoires.ts
```

This verifies:

- ✅ Grimoire scanning from `packages/grimoires/`
- ✅ Kon discovery from `packages/kons/`
- ✅ Custom UI view detection
- ✅ Grimoire manifest validation
- ✅ Admin registry building (simulated)

### 2. Start the API (For Full Testing)

```bash
docker compose up -d kitsuden_api
# or
pnpm --filter @kitsuden/api dev
```

## 🧪 Manual Testing Steps

### Test 1: Verify Grimoire Scanning

**Check:** Grimoires are dynamically discovered from `packages/grimoires/`

```bash
curl http://localhost:3001/api/modules | jq '.docs[] | select(.category == "grimoire") | {name, grimoireId, category}'
```

**Expected Output:**

```json
{
  "name": "Games",
  "grimoireId": "grimoire-esports",
  "category": "grimoire"
}
{
  "name": "Streamers",
  "grimoireId": "grimoire-esports",
  "category": "grimoire"
}
```

**Verify:** Each grimoire kon has `grimoireId` set and `canToggle: false`.

---

### Test 2: Verify Admin Registry

**Check:** Admin panel gets dynamic kon configs

```bash
# With authentication
curl -H "Cookie: your-auth-cookie" http://localhost:3001/api/admin/registry | jq '.[] | select(.category == "esports") | {id, name, category}'
```

**Expected Output:**

```json
{
  "id": "kon-games",
  "name": "Games",
  "category": "esports"
}
```

**Verify:**

- Grimoire kons have `category: "esports"`
- Standalone kons have `category: "core"`, `"content"`, or `"data"`
- Engine infrastructure (media-library) is NOT in the list

---

### Test 3: Verify Custom UI Detection

**Check:** Kons with custom views are properly detected

```bash
curl -H "Cookie: your-auth-cookie" http://localhost:3001/api/admin/registry | jq '.[] | select(.hasCustomView == true) | {id, name, views: [.views[] | select(.type == "custom")]}'
```

**Expected Output:**

```json
{
  "id": "kon-academy-lms",
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

**Check:** Kons without custom views get grid views

```bash
curl -H "Cookie: your-auth-cookie" http://localhost:3001/api/admin/registry | jq '.[] | select(.hasCustomView == false) | {id, name, defaultView, views: [.views[].type]}'
```

**Expected Output:**

```json
{
  "id": "kon-booking",
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

**Check:** Admin panel sidebar shows kons in correct groups

1. Open http://localhost:3000/kons
2. Check that kons are grouped by category
3. Verify grimoire kons show under their grimoire name (e.g., "Esports")

**Expected Groups:**

- **Core Kons**: promote, blocks, formulas, webhooks, connectors, workers
- **Optional Features**: academy, blog, dms, booking, etc.
- **Esports**: games, streamers, platforms, etc.

---

### Test 6: Test Adding a New Grimoire (Full Dynamic Test)

**Step 1:** Create a new grimoire

```bash
mkdir -p packages/grimoires/grimoire-testgrimoire
cat > packages/grimoires/grimoire-testgrimoire/grimoire.json << 'EOF'
{
  "id": "grimoire-testgrimoire",
  "name": "Test Grimoire",
  "description": "A test grimoire for verifying dynamic loading",
  "version": "1.0.0",
  "type": "grimoire",
  "kons": [
    "kon-games"
  ]
}
EOF
```

**Step 2:** Restart API

```bash
docker compose restart kitsuden_api
```

**Step 3:** Verify new grimoire is detected

```bash
curl http://localhost:3001/api/modules | jq '.docs[] | select(.grimoireId == "grimoire-testgrimoire")'
```

**Expected:** The games kon should now show `grimoireId: "grimoire-testgrimoire"` when the test grimoire is active.

**Step 4:** Clean up

```bash
rm -rf packages/grimoires/grimoire-testgrimoire
```

---

### Test 7: Verify Core Mechanics Unchanged

**Check:** Non-grimoire kons still work correctly

```bash
# Core kons
curl http://localhost:3001/api/modules | jq '.docs[] | select(.category == "core") | .name'

# Optional kons
curl http://localhost:3001/api/modules | jq '.docs[] | select(.category == "optional" or .category == "content" or .category == "data") | .name'
```

**Expected:**

- Core: Promote, Blocks, Formulas, Webhooks, Connectors, Workers
- Optional: Academy, Blog, DMS, Booking, etc.

---

## 📊 Test Results Summary

After running all tests, you should see:

| Component              | Status | Notes                                         |
| ---------------------- | ------ | --------------------------------------------- |
| Grimoire Scanning      | ✅     | Grimoires auto-discovered from filesystem     |
| Kon Discovery          | ✅     | All kons found and categorized                |
| Dynamic Categorization | ✅     | Grimoire kons → "esports"                     |
| Custom UI Detection    | ✅     | Views detected for academy, blog, games, etc. |
| Grid View Fallback     | ✅     | Non-custom kons get grid views                |
| Sidebar Integration    | ✅     | Groups by grimoire name dynamically           |
| Core Mechanics         | ✅     | Core and optional kons unchanged              |

---

## 🐛 Troubleshooting

### Issue: Grimoires not appearing

**Check:**

- Directory exists: `packages/grimoires/grimoire-*/`
- File exists: `grimoire.json` or `kitsuden.json`
- Valid JSON with `id`, `name`, `kons` fields

### Issue: Kons not in admin

**Check:**

- Kon exists in `packages/kons/`
- Has valid `kon.json`
- Not in `ENGINE_INFRASTRUCTURE` list

### Issue: Custom views not detected

**Check:**

- View file exists: `packages/admin/src/views/{kon}/{Name}View.svelte`
- File name matches pattern (PascalCase)

### Issue: 401 errors

**Check:**

- User is authenticated
- Cookie is being sent with requests
- Run tests with `credentials: "include"`

---

## ✅ Success Criteria

All tests pass if:

1. ✅ Grimoires are scanned dynamically from filesystem
2. ✅ Kons are categorized correctly (core/optional/esports)
3. ✅ Custom views are detected and paths are correct
4. ✅ Grid views work as fallback
5. ✅ Sidebar groups kons by grimoire
6. ✅ Core kons still work unchanged
7. ✅ No 401/500 errors in API responses
