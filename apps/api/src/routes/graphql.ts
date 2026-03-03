/**
 * GremiusCMS — GraphQL API Layer
 *
 * Auto-generated GraphQL schema for content delivery.
 * Provides typed queries for:
 *   - Blog posts (with embedded blocks)
 *   - Games (with blocks, platforms, tags)
 *   - Data entries
 *   - Media
 *
 * Uses a lightweight approach: no heavy framework,
 * just graphql-js execution with Hono integration.
 *
 * Endpoint: POST /api/graphql
 * Playground: GET /api/graphql (returns GraphiQL HTML)
 */

import { Hono } from "hono";
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType,
  GraphQLInputObjectType,
  graphql,
  type GraphQLFieldConfigMap,
} from "graphql";
import GraphQLJSON from "graphql-type-json";
import { db } from "../db";
import {
  blogPosts, games, media, dataSets, dataEntries,
  tags, platforms, streamers, authUsers as user
} from "../db/schema";
import { eq, desc, asc, ilike, and, sql, count } from "drizzle-orm";

export const graphqlRoutes = new Hono();

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

const ContentBlockType = new GraphQLObjectType({
  name: "ContentBlock",
  fields: {
    id: { type: GraphQLString },
    type: { type: new GraphQLNonNull(GraphQLString) },
    data: { type: GraphQLJSON },
    order: { type: GraphQLInt },
  },
});

const MediaType = new GraphQLObjectType({
  name: "Media",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    filename: { type: GraphQLString },
    mimeType: { type: GraphQLString },
    url: { type: GraphQLString },
    alt: { type: GraphQLString },
    caption: { type: GraphQLString },
    width: { type: GraphQLInt },
    height: { type: GraphQLInt },
    size: { type: GraphQLInt },
  },
});

const AuthorType = new GraphQLObjectType({
  name: "Author",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLString },
    image: { type: GraphQLString },
  },
});

const TagType = new GraphQLObjectType({
  name: "Tag",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLString },
    slug: { type: GraphQLString },
    color: { type: GraphQLString },
    category: { type: GraphQLString },
  },
});

const PlatformType = new GraphQLObjectType({
  name: "Platform",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLString },
    slug: { type: GraphQLString },
    shortName: { type: GraphQLString },
    manufacturer: { type: GraphQLString },
  },
});

const BlogPostType = new GraphQLObjectType({
  name: "BlogPost",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    title: { type: GraphQLString },
    slug: { type: GraphQLString },
    content: { type: GraphQLJSON },
    excerpt: { type: GraphQLString },
    status: { type: GraphQLString },
    publishedAt: { type: GraphQLString },
    readingTime: { type: GraphQLInt },
    blocks: { type: new GraphQLList(ContentBlockType) },
    seoOverrides: { type: GraphQLJSON },
    author: {
      type: AuthorType,
      async resolve(post: any) {
        if (!post.authorId) return null;
        const [author] = await db.select({
          id: user.id, name: user.name, image: user.image,
        }).from(user).where(eq(user.id, post.authorId)).limit(1);
        return author || null;
      },
    },
    featuredImage: {
      type: MediaType,
      async resolve(post: any) {
        if (!post.featuredImageId) return null;
        const [img] = await db.select().from(media).where(eq(media.id, post.featuredImageId)).limit(1);
        return img || null;
      },
    },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  },
});

const GameType = new GraphQLObjectType({
  name: "Game",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    title: { type: GraphQLString },
    slug: { type: GraphQLString },
    subtitle: { type: GraphQLString },
    description: { type: GraphQLJSON },
    excerpt: { type: GraphQLString },
    releaseDate: { type: GraphQLString },
    status: { type: GraphQLString },
    developer: { type: GraphQLString },
    publisher: { type: GraphQLString },
    metacriticScore: { type: GraphQLInt },
    userRating: { type: GraphQLFloat },
    trailerUrl: { type: GraphQLString },
    externalIds: { type: GraphQLJSON },
    blocks: { type: new GraphQLList(ContentBlockType) },
    isFeaturedOnHome: { type: GraphQLBoolean },
    coverArt: {
      type: MediaType,
      async resolve(game: any) {
        if (!game.coverArtId) return null;
        const [img] = await db.select().from(media).where(eq(media.id, game.coverArtId)).limit(1);
        return img || null;
      },
    },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  },
});

const DataEntryType = new GraphQLObjectType({
  name: "DataEntry",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    title: { type: GraphQLString },
    dataSetId: { type: GraphQLString },
    data: { type: GraphQLJSON },
    sortOrder: { type: GraphQLInt },
    status: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  },
});

const StreamerType = new GraphQLObjectType({
  name: "Streamer",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    displayName: { type: GraphQLString },
    slug: { type: GraphQLString },
    platform: { type: GraphQLString },
    channelId: { type: GraphQLString },
    channelUrl: { type: GraphQLString },
    isLive: { type: GraphQLBoolean },
    currentStreamTitle: { type: GraphQLString },
    viewerCount: { type: GraphQLInt },
    followerCount: { type: GraphQLInt },
    createdAt: { type: GraphQLString },
  },
});

// Paginated wrappers
function paginatedType(name: string, itemType: GraphQLObjectType) {
  return new GraphQLObjectType({
    name: `${name}Page`,
    fields: {
      docs: { type: new GraphQLList(itemType) },
      totalDocs: { type: GraphQLInt },
      page: { type: GraphQLInt },
      limit: { type: GraphQLInt },
      hasNextPage: { type: GraphQLBoolean },
    },
  });
}

const BlogPostPage = paginatedType("BlogPost", BlogPostType);
const GamePage = paginatedType("Game", GameType);
const DataEntryPage = paginatedType("DataEntry", DataEntryType);

// ═══════════════════════════════════════════════════════════════
// Query Root
// ═══════════════════════════════════════════════════════════════

const queryFields: GraphQLFieldConfigMap<any, any> = {
  // ── Blog Posts ──
  blogPost: {
    type: BlogPostType,
    args: {
      id: { type: GraphQLString },
      slug: { type: GraphQLString },
    },
    async resolve(_, args) {
      if (args.id) {
        const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, args.id)).limit(1);
        return post || null;
      }
      if (args.slug) {
        const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, args.slug)).limit(1);
        return post || null;
      }
      return null;
    },
  },

  blogPosts: {
    type: BlogPostPage,
    args: {
      page: { type: GraphQLInt, defaultValue: 1 },
      limit: { type: GraphQLInt, defaultValue: 20 },
      status: { type: GraphQLString },
      search: { type: GraphQLString },
    },
    async resolve(_, args) {
      const conditions = [];
      if (args.status) conditions.push(eq(blogPosts.status, args.status));
      if (args.search) conditions.push(ilike(blogPosts.title, `%${args.search}%`));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (args.page - 1) * args.limit;

      const [docs, [total]] = await Promise.all([
        db.select().from(blogPosts).where(where).orderBy(desc(blogPosts.createdAt)).limit(args.limit).offset(offset),
        db.select({ value: count() }).from(blogPosts).where(where),
      ]);

      return {
        docs,
        totalDocs: total?.value || 0,
        page: args.page,
        limit: args.limit,
        hasNextPage: offset + docs.length < (total?.value || 0),
      };
    },
  },

  // ── Games ──
  game: {
    type: GameType,
    args: {
      id: { type: GraphQLString },
      slug: { type: GraphQLString },
    },
    async resolve(_, args) {
      if (args.id) {
        const [g] = await db.select().from(games).where(eq(games.id, args.id)).limit(1);
        return g || null;
      }
      if (args.slug) {
        const [g] = await db.select().from(games).where(eq(games.slug, args.slug)).limit(1);
        return g || null;
      }
      return null;
    },
  },

  games: {
    type: GamePage,
    args: {
      page: { type: GraphQLInt, defaultValue: 1 },
      limit: { type: GraphQLInt, defaultValue: 20 },
      status: { type: GraphQLString },
      search: { type: GraphQLString },
      featured: { type: GraphQLBoolean },
    },
    async resolve(_, args) {
      const conditions = [];
      if (args.status) conditions.push(eq(games.status, args.status));
      if (args.search) conditions.push(ilike(games.title, `%${args.search}%`));
      if (args.featured !== undefined) conditions.push(eq(games.isFeaturedOnHome, args.featured));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (args.page - 1) * args.limit;

      const [docs, [total]] = await Promise.all([
        db.select().from(games).where(where).orderBy(desc(games.createdAt)).limit(args.limit).offset(offset),
        db.select({ value: count() }).from(games).where(where),
      ]);

      return {
        docs,
        totalDocs: total?.value || 0,
        page: args.page,
        limit: args.limit,
        hasNextPage: offset + docs.length < (total?.value || 0),
      };
    },
  },

  // ── Data Entries (by dataset) ──
  dataEntries: {
    type: DataEntryPage,
    args: {
      dataSetId: { type: new GraphQLNonNull(GraphQLString) },
      page: { type: GraphQLInt, defaultValue: 1 },
      limit: { type: GraphQLInt, defaultValue: 50 },
      status: { type: GraphQLString },
    },
    async resolve(_, args) {
      const conditions = [eq(dataEntries.dataSetId, args.dataSetId)];
      if (args.status) conditions.push(eq(dataEntries.status, args.status));

      const where = and(...conditions);
      const offset = (args.page - 1) * args.limit;

      const [docs, [total]] = await Promise.all([
        db.select().from(dataEntries).where(where).orderBy(asc(dataEntries.sortOrder)).limit(args.limit).offset(offset),
        db.select({ value: count() }).from(dataEntries).where(where),
      ]);

      return {
        docs,
        totalDocs: total?.value || 0,
        page: args.page,
        limit: args.limit,
        hasNextPage: offset + docs.length < (total?.value || 0),
      };
    },
  },

  // ── Media ──
  media: {
    type: MediaType,
    args: { id: { type: new GraphQLNonNull(GraphQLString) } },
    async resolve(_, args) {
      const [m] = await db.select().from(media).where(eq(media.id, args.id)).limit(1);
      return m || null;
    },
  },

  // ── Tags ──
  tags: {
    type: new GraphQLList(TagType),
    async resolve() {
      return db.select().from(tags).orderBy(asc(tags.name));
    },
  },

  // ── Platforms ──
  platforms: {
    type: new GraphQLList(PlatformType),
    async resolve() {
      return db.select().from(platforms).orderBy(asc(platforms.name));
    },
  },

  // ── Streamers ──
  streamers: {
    type: new GraphQLList(StreamerType),
    args: {
      live: { type: GraphQLBoolean },
      platform: { type: GraphQLString },
    },
    async resolve(_, args) {
      const conditions = [];
      if (args.live !== undefined) conditions.push(eq(streamers.isLive, args.live));
      if (args.platform) conditions.push(eq(streamers.platform, args.platform as any));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(streamers).where(where).orderBy(desc(streamers.viewerCount));
    },
  },
};

const QueryRoot = new GraphQLObjectType({
  name: "Query",
  fields: queryFields,
});

// ═══════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════

const schema = new GraphQLSchema({ query: QueryRoot });

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════

// POST /api/graphql — Execute query
graphqlRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const { query: queryStr, variables, operationName } = body;

  if (!queryStr) {
    return c.json({ errors: [{ message: "Query string required" }] }, 400);
  }

  const result = await graphql({
    schema,
    source: queryStr,
    variableValues: variables,
    operationName,
  });

  return c.json(result);
});

// GET /api/graphql — GraphiQL playground (simple HTML)
graphqlRoutes.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>GremiusCMS GraphQL</title>
  <style>body { height: 100%; margin: 0; width: 100%; overflow: hidden; }</style>
  <link href="https://unpkg.com/graphiql@3/graphiql.min.css" rel="stylesheet" />
</head>
<body>
  <div id="graphiql" style="height: 100vh;"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
  <script>
    const fetcher = GraphiQL.createFetcher({ url: window.location.href });
    ReactDOM.createRoot(document.getElementById('graphiql')).render(
      React.createElement(GraphiQL, { fetcher })
    );
  </script>
</body>
</html>`;
  return c.html(html);
});
