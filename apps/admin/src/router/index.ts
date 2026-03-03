import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

let systemInstalled = null; // Cache system installation status

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ── Login (no sidebar layout) ──
    {
      path: "/login",
      name: "login",
      component: () => import("../views/auth/LoginView.vue"),
      meta: { guest: true },
    },
    {
      path: "/setup",
      name: "setup",
      component: () => import("../views/auth/SetupView.vue"),
      meta: { guest: true },
    },
    // ── Authenticated routes (sidebar layout) ──
    {
      path: "/",
      component: () => import("../layouts/SidebarLayout.vue"),
      meta: { auth: true },
      children: [
        { path: "", name: "dashboard", component: () => import("../views/Dashboard.vue") },
        { path: "games", name: "games", component: () => import("../views/Games.vue") },
        { path: "games/collections", name: "collections", component: () => import("../views/games/CollectionsList.vue") },
        { path: "games/collections/new", name: "collection-create", component: () => import("../views/games/CollectionEditor.vue") },
        { path: "games/collections/:id", name: "collection-edit", component: () => import("../views/games/CollectionEditor.vue") },
        { path: "posts", name: "posts", component: () => import("../views/Posts.vue") },
        { path: "posts/new", name: "post-create", component: () => import("../views/PostCreate.vue") },
        { path: "streamers", name: "streamers", component: () => import("../views/Streamers.vue") },
        { path: "media", name: "media", component: () => import("../views/Media.vue") },
        // ── Datasets Module ──
        { path: "datasets", name: "datasets", component: () => import("../views/DataSets.vue") },
        { path: "datasets/new", name: "dataset-create", component: () => import("../views/DataSetSchema.vue") },
        { path: "datasets/:id/edit", name: "dataset-edit", component: () => import("../views/DataSetSchema.vue") },
        { path: "datasets/:id/entries", name: "dataset-entries", component: () => import("../views/DataSetEntries.vue") },
        // ── Gremius CRM (data lives in datasets) ──
        { path: "gremius-crm", name: "gremius-crm", component: () => import("../views/DataSets.vue") },
        // ── Data Explorer ──
        { path: "data/:collection", name: "data-explorer", component: () => import("../views/data/DataGrid.vue") },
        // ── Formulas KPI ──
        { path: "formulas", name: "formulas", component: () => import("../views/formulas/FormulasList.vue") },
        { path: "formulas/new", name: "formula-create", component: () => import("../views/formulas/FormulaEditor.vue") },
        { path: "formulas/:id", name: "formula-edit", component: () => import("../views/formulas/FormulaEditor.vue") },
        // ── System ──
        { path: "editor", name: "editor", component: () => import("../views/content/EditorView.vue") },
        { path: "users/:id", name: "user-profile", component: () => import("../views/users/UserProfile.vue") },
        { path: "workers", name: "workers", component: () => import("../views/workers/WorkersView.vue") },
        { path: "webhooks", name: "webhooks", component: () => import("../views/webhooks/WebhooksView.vue") },
        { path: "modules", name: "modules", component: () => import("../views/Modules.vue") },
        { path: "themes", name: "themes", component: () => import("../views/settings/ThemesView.vue") },
        { path: "settings", name: "settings", component: () => import("../views/Settings.vue") },
      ],
    },
  ],
});

// ── Global State ──
let isSystemInitialized: boolean | null = null;

// ── Global Guard ──
router.beforeEach(async (to, _from, next) => {
  if (to.path.startsWith('/assets') || to.path.startsWith('/favicon')) return next();

  if (isSystemInitialized === null) {
    try {
      const res = await fetch('http://localhost:3001/api/system/init-check');
      if (res.ok) {
        const data = await res.json();
        isSystemInitialized = !!data.initialized;
      } else {
        console.error("API Error, failing open to Login");
        isSystemInitialized = true;
      }
    } catch (e) {
      console.error("Network Error", e);
      isSystemInitialized = true;
    }
  }

  if (isSystemInitialized === false) {
    if (to.path === '/setup') return next();
    return next('/setup');
  }

  if (isSystemInitialized === true) {
    if (to.path === '/setup') return next({ name: 'login' });
  }

  const authStore = useAuthStore();

  if (!authStore.checked) {
    await authStore.checkSession();
  }

  const requiresAuth = to.matched.some((r) => r.meta.auth);
  const isGuestRoute = to.matched.some((r) => r.meta.guest);

  if (requiresAuth && !authStore.isLoggedIn) {
    return next({ name: "login", query: { redirect: to.fullPath } });
  }

  if (requiresAuth && !authStore.isAdmin) {
    await authStore.signOut();
    return next({ name: "login" });
  }

  if (isGuestRoute && authStore.isLoggedIn && authStore.isAdmin) {
    return next({ path: "/" });
  }

  next();
});

export default router;
