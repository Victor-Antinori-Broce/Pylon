# Backend in 15 Minutes — Gremius Vibecoder Demo

> **Prerequisite:** Node.js + Docker Desktop installed.  
> **Goal:** Go from zero to a working backend with auth, database, admin panel, and typed frontend hooks.

---

## Minute 0–2: Initialize

```bash
npx gremius@latest init my-app --template blog
```

**What happens:**
- Creates `my-app/` with Docker Compose, `.env`, and `realm.json`
- Template: `grimoire-auth` + `grimoire-blog` + `grimoire-media`

```bash
cd my-app
```

---

## Minute 2–5: Start Services

**Windows:**
```cmd
init.bat
```

**Mac/Linux:**
```bash
./init.sh
```

**What happens:**
- PostgreSQL + Valkey + MinIO + Gremius API + Admin spin up
- First build takes ~3 minutes; subsequent starts are <30s

**Verify:**
```bash
gremius status
# ✅ API: http://localhost:3000
# ✅ Admin: http://localhost:3001
# ✅ DB: PostgreSQL connected
```

---

## Minute 5–7: Enable Auth (Optional but Recommended)

**Email/password** is already enabled by default. Add Google OAuth:

```bash
npx gremius auth add google \
  --client-id YOUR_GOOGLE_CLIENT_ID \
  --client-secret YOUR_GOOGLE_CLIENT_SECRET
```

Restart the API container:
```bash
docker compose restart gremius_api
```

---

## Minute 7–10: Create Data (Two Ways)

### Way A — Via Admin UI
1. Open http://localhost:3001
2. Sign in with any email (first user = admin)
3. Go to **Blog Posts** → **New Post**
4. Write title, content, tags, SEO meta

### Way B — Via API / MCP
```bash
# Create a post
curl -X POST http://localhost:3000/api/items/blog-posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello Gremius",
    "slug": "hello-gremius",
    "content": "{\"type\":\"doc\",\"content\":[]}",
    "status": "published",
    "excerpt": "My first post"
  }'
```

---

## Minute 10–13: Generate Frontend Code

```bash
# React hooks + components + types
npx gremius generate-sdk --framework react --collection blog-posts

# Output: ./sdk/blog-posts/
#   - useBlogPosts.ts      (SWR query hook)
#   - useCreateBlogPost.ts (mutation hook)
#   - BlogPostList.tsx     (data grid component)
#   - BlogPostForm.tsx     (create/edit form)
#   - blog-posts.types.ts  (TypeScript interfaces)
```

**Copy the generated files into your frontend project.**

---

## Minute 13–15: Wire It Up

In your React/Vue/Svelte app:

```tsx
import { useBlogPosts } from "./sdk/blog-posts/useBlogPosts";
import { BlogPostList } from "./sdk/blog-posts/BlogPostList";

export default function BlogPage() {
  const { posts, loading, error } = useBlogPosts({ status: "published" });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <BlogPostList posts={posts} />;
}
```

**Done.** You now have:
- ✅ Auth (email + optional OAuth)
- ✅ Database (PostgreSQL with RLS)
- ✅ Admin panel (http://localhost:3001)
- ✅ REST API (http://localhost:3000/api)
- ✅ Typed frontend hooks
- ✅ MCP server for AI agents (`http://localhost:3000/api/mcp`)

---

## Next Steps

```bash
# Deploy to Railway
gremius deploy --provider railway

# Or add more features
gremius install grimoire-booking    # appointment scheduling
gremius install grimoire-crm        # contacts & pipelines

# Or let Cursor/Claude do it via MCP
gremius mcp connect
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3000 already in use | Edit `.env` → change `API_PORT=3002` |
| Database connection failed | Wait 10s for Postgres to start, then restart API |
| Auth redirect fails | Check `BETTER_AUTH_URL` matches your localhost port |
| Generated SDK has wrong types | Re-run `gremius generate-sdk` after schema changes |

---

**Video walkthrough:** [youtube.com/gremius/15-min-backend](https://youtube.com) *(placeholder)*  
**Community:** [discord.gg/gremius](https://discord.gg) *(placeholder)*
