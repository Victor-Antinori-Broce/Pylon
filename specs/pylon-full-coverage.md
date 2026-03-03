# GremiusCMS — Complete E2E Test Plan

## Application Overview

GremiusCMS is a gaming-focused headless CMS built with Vue 3 (admin), Hono/Bun (API), and PostgreSQL. The admin panel at `http://localhost:5173` provides a dark-themed interface for managing games, blog posts, media, datasets, modules, and system settings.

Key features:
- **Authentication**: Login/setup flow with session management
- **Games Management**: CRUD for games with metadata, covers, tags, platforms
- **Blog Posts**: Rich text editor with block builder, SEO, tags
- **Media Library**: S3/MinIO upload with drag-and-drop
- **Data Sets**: No-code custom data tables (native feature, always active)
- **Modules System**: Toggleable modules with dependency validation (native/core/optional)
- **Streamers**: Optional module for live streamer tracking
- **Fórmulas KPI**: Optional module for virtual field calculations
- **Data Explorer**: Admin tool to browse all database tables
- **Settings**: Site configuration, branding, navigation, social links

## Test Scenarios

### 1. Authentication Flow

**Seed:** `tests/seed.spec.ts`

#### 1.1 Successful Admin Login

**Steps:**
1. Navigate to `http://localhost:5173`
2. Should redirect to `/login`
3. Enter email: `admin@gremiuscms.dev`
4. Enter password: `admin123`
5. Click "Sign In" button

**Expected Results:**
- Redirects to dashboard (`/`)
- "Welcome back" heading is visible
- Sidebar shows GremiusCMS branding
- "API Connected" indicator is green
- User avatar/initial visible in sidebar footer

#### 1.2 Failed Login

**Steps:**
1. Navigate to `/login`
2. Enter email: `admin@gremiuscms.dev`
3. Enter password: `wrongpassword`
4. Click "Sign In"

**Expected Results:**
- Stays on `/login`
- Error message visible (e.g. "Invalid credentials")
- Form fields retain email value

#### 1.3 Session Persistence

**Steps:**
1. Login successfully
2. Navigate to `/games`
3. Reload the page

**Expected Results:**
- Does not redirect to `/login`
- Games page loads correctly
- User remains authenticated

---

### 2. Dashboard

**Seed:** `tests/seed.spec.ts`

#### 2.1 Dashboard Stats Visible

**Steps:**
1. Login and arrive at dashboard

**Expected Results:**
- Stats grid shows 4 cards (Games, Posts, Media, Streamers or similar)
- Each stat card has a numeric value and label
- "Recent Games" section visible with game entries
- "Welcome back" banner visible

---

### 3. Games Module

**Seed:** `tests/seed.spec.ts`

#### 3.1 Games List Page

**Steps:**
1. Click "Games" in sidebar

**Expected Results:**
- Navigates to `/games`
- Table/grid shows seeded games (e.g. "Elden Ring", "Hades")
- Each game row shows title, status, metacritic score
- Search bar or filter controls visible

#### 3.2 View Game Details

**Steps:**
1. Navigate to `/games`
2. Click on a game (e.g. "Elden Ring")

**Expected Results:**
- Game detail/edit page loads
- Title field contains "Elden Ring"
- Metadata fields visible (developer, publisher, metacritic)
- Cover art section visible
- Tags and platforms sections visible

---

### 4. Blog Posts Module

**Seed:** `tests/seed.spec.ts`

#### 4.1 Blog Posts List

**Steps:**
1. Click "Blog Posts" in sidebar

**Expected Results:**
- Navigates to `/posts`
- Shows at least 1 post ("Welcome to GremiusCMS")
- Post entries show title, status, date

#### 4.2 Create New Blog Post

**Steps:**
1. Click "Blog Posts" in sidebar
2. Click "New Post" or similar button
3. Enter title: "Playwright Test Post"
4. Click "Save Draft"

**Expected Results:**
- Navigates to post editor (`/posts/new`)
- Title input accepts text
- Save Draft button visible
- After save, success indication shown

---

### 5. Media Library

**Seed:** `tests/seed.spec.ts`

#### 5.1 Media Library Page

**Steps:**
1. Click "Media Library" in sidebar

**Expected Results:**
- Navigates to `/media`
- Upload area or button visible
- Grid/list of uploaded media items (if any)

---

### 6. Data Sets (Native Module)

**Seed:** `tests/seed.spec.ts`

#### 6.1 Data Sets List

**Steps:**
1. Click "Data Sets" in sidebar

**Expected Results:**
- Navigates to `/datasets`
- "Create" or "New Data Set" button visible
- Shows existing datasets if any

#### 6.2 Create New Data Set Schema

**Steps:**
1. Navigate to `/datasets`
2. Click "New Data Set" button
3. Enter name: "Test Characters"
4. Add a field: name="character_name", type="text"

**Expected Results:**
- Schema builder form visible
- Can add fields with name and type
- Save button visible

---

### 7. Modules System

**Seed:** `tests/seed.spec.ts`

#### 7.1 Modules Page Structure

**Steps:**
1. Click "Modules" in sidebar

**Expected Results:**
- Navigates to `/modules`
- Three sections visible:
  - "NATIVE — Always Active" with Data Sets (amber badge, no toggle)
  - "CORE MODULES" with Games, Blog Posts, Media Library (green toggles, cyan CORE badge)
  - "OPTIONAL MODULES" with Streamers, Fórmulas KPI (toggleable)
- Header shows active count and total count

#### 7.2 Native Module Cannot Be Disabled

**Steps:**
1. Navigate to `/modules`
2. Look at the "Data Sets" card in Native section

**Expected Results:**
- No toggle switch (or toggle is locked/amber)
- Shows "NATIVE" badge
- Shows "Siempre activo — no se puede desactivar"

#### 7.3 Toggle Optional Module Off

**Steps:**
1. Navigate to `/modules`
2. Find "Streamers" card in Optional section
3. If enabled, click toggle to disable

**Expected Results:**
- Toggle switches off
- Card visual changes (dimmed, border removed)
- "Desactivado" footer appears
- Active count in header decreases by 1

#### 7.4 Toggle Optional Module On

**Steps:**
1. Navigate to `/modules`
2. Find a disabled optional module
3. Click toggle to enable

**Expected Results:**
- Toggle switches on (green)
- "Activo" footer appears
- Active count increases by 1

#### 7.5 Sidebar Reflects Module State

**Steps:**
1. Navigate to `/modules`
2. Disable "Games" module (if no dependencies block it)
3. Check sidebar

**Expected Results:**
- "Games" link disappears from sidebar
- "Collections" link also disappears
- Re-enabling shows them again

#### 7.6 Core Module Dependency Block (if data exists)

**Steps:**
1. Ensure there are blog posts referencing games
2. Navigate to `/modules`
3. Try to disable "Games"

**Expected Results:**
- Checking spinner appears briefly
- Blocker dialog appears
- Shows "Blog posts referencing games" with row count
- "Entendido" button closes dialog
- Module remains enabled

---

### 8. Fórmulas KPI (Optional Module)

**Seed:** `tests/seed.spec.ts`

#### 8.1 Formula Editor Page

**Steps:**
1. Enable "Fórmulas KPI" module if disabled
2. Click "Fórmulas KPI" in sidebar

**Expected Results:**
- Navigates to `/formulas`
- Shows formula list or empty state
- "Nueva Fórmula" button visible

#### 8.2 Create New Formula

**Steps:**
1. Navigate to `/formulas`
2. Click "Nueva Fórmula"
3. Select a KPI from dropdown
4. Select "Fórmula Personalizada" as type
5. Enter expression: `(resultado / meta) * 100`
6. Set threshold to `95`
7. Click "Guardar"

**Expected Results:**
- Editor loads at `/formulas/new`
- KPI dropdown has options
- Expression textarea accepts input
- Threshold field shows `%` indicator
- Preview card updates with threshold color (green at 95%)
- Console logs JSON payload on save

#### 8.3 Formula Validation

**Steps:**
1. Navigate to `/formulas/new`
2. Leave expression empty
3. Click "Guardar"

**Expected Results:**
- Red error message appears below expression: "La expresión base es obligatoria"
- Form does NOT submit

---

### 9. Settings

**Seed:** `tests/seed.spec.ts`

#### 9.1 Settings Page

**Steps:**
1. Click "Settings" in sidebar

**Expected Results:**
- Navigates to `/settings`
- Site name field shows "GremiusCMS"
- Various configuration sections visible

---

### 10. Sidebar Navigation

**Seed:** `tests/seed.spec.ts`

#### 10.1 All Core Nav Items Present

**Steps:**
1. Login and check sidebar

**Expected Results (when all modules enabled):**
- Dashboard link present
- Games link present
- Collections link present
- Blog Posts link present
- Media Library link present
- Data Sets link present
- Data Explorer link present
- Modules link present
- Themes link present
- Settings link present

#### 10.2 Sidebar Collapse

**Steps:**
1. Click collapse button at bottom of sidebar

**Expected Results:**
- Sidebar shrinks to icon-only width (~64px)
- Labels disappear, only icons visible
- Click again to expand

---

### 11. API Health

**Seed:** `tests/seed.spec.ts`

#### 11.1 API Health Check

**Steps:**
1. Send GET request to `http://localhost:3001/api/health`

**Expected Results:**
- Status 200
- Response includes `{ status: "ok", service: "gremius-api" }`

#### 11.2 API Games Endpoint

**Steps:**
1. Send GET to `http://localhost:3001/api/games`

**Expected Results:**
- Status 200
- `docs` array with 3+ games
- Each game has `title`, `slug`, `status`

#### 11.3 API Modules Endpoint

**Steps:**
1. Send GET to `http://localhost:3001/api/modules`

**Expected Results:**
- Status 200
- `docs` array includes modules with categories: "native", "core", "optional"
- Data Sets has `category: "native"`
- Games, Blog Posts, Media Library have `category: "core"`
- Streamers, Fórmulas KPI have `category: "optional"`
