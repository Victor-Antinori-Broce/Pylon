/**
 * Mock Data Composable — Realistic gaming data for UI development
 */

export interface GameRow {
  id: string;
  title: string;
  slug: string;
  developer: string;
  publisher: string;
  status: "published" | "draft" | "archived";
  metacriticScore: number | null;
  userRating: number | null;
  releaseDate: string | null;
  coverArtUrl: string | null;
  platforms: string[];
  tags: string[];
  excerpt: string;
}

export interface PostRow {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "scheduled";
  authorName: string;
  publishedAt: string | null;
  readingTime: number;
  tags: string[];
  excerpt: string;
}

export interface StreamerRow {
  id: string;
  displayName: string;
  slug: string;
  platform: "twitch" | "youtube" | "kick";
  isLive: boolean;
  viewerCount: number;
  followerCount: number;
  currentStreamTitle: string | null;
  avatarUrl: string | null;
}

export function useMockData() {
  const games: GameRow[] = [
    { id: "g1", title: "Elden Ring", slug: "elden-ring", developer: "FromSoftware", publisher: "Bandai Namco", status: "published", metacriticScore: 96, userRating: 9.2, releaseDate: "2022-02-25", coverArtUrl: null, platforms: ["PC", "PS5", "XSX"], tags: ["RPG", "Open World", "Soulslike"], excerpt: "An action RPG set in the Lands Between." },
    { id: "g2", title: "Baldur's Gate 3", slug: "baldurs-gate-3", developer: "Larian Studios", publisher: "Larian Studios", status: "published", metacriticScore: 96, userRating: 9.5, releaseDate: "2023-08-03", coverArtUrl: null, platforms: ["PC", "PS5"], tags: ["RPG", "Turn-Based"], excerpt: "A next-generation RPG set in D&D." },
    { id: "g3", title: "Zelda: Tears of the Kingdom", slug: "zelda-totk", developer: "Nintendo EPD", publisher: "Nintendo", status: "published", metacriticScore: 96, userRating: 9.4, releaseDate: "2023-05-12", coverArtUrl: null, platforms: ["NSW"], tags: ["Adventure", "Open World"], excerpt: "An epic adventure across Hyrule." },
    { id: "g4", title: "Cyberpunk 2077: Phantom Liberty", slug: "cyberpunk-phantom-liberty", developer: "CD Projekt Red", publisher: "CD Projekt", status: "published", metacriticScore: 89, userRating: 8.8, releaseDate: "2023-09-26", coverArtUrl: null, platforms: ["PC", "PS5", "XSX"], tags: ["RPG", "FPS", "Open World"], excerpt: "A spy-thriller expansion for Cyberpunk 2077." },
    { id: "g5", title: "GTA VI", slug: "gta-vi", developer: "Rockstar Games", publisher: "Rockstar Games", status: "draft", metacriticScore: null, userRating: null, releaseDate: "2025-10-01", coverArtUrl: null, platforms: ["PS5", "XSX"], tags: ["Open World", "Action"], excerpt: "The next entry in the Grand Theft Auto series." },
    { id: "g6", title: "Hollow Knight: Silksong", slug: "hollow-knight-silksong", developer: "Team Cherry", publisher: "Team Cherry", status: "draft", metacriticScore: null, userRating: null, releaseDate: null, coverArtUrl: null, platforms: ["PC", "NSW"], tags: ["Metroidvania", "Indie"], excerpt: "The long-awaited sequel to Hollow Knight." },
    { id: "g7", title: "Hades II", slug: "hades-ii", developer: "Supergiant Games", publisher: "Supergiant Games", status: "published", metacriticScore: 93, userRating: 9.1, releaseDate: "2024-05-06", coverArtUrl: null, platforms: ["PC"], tags: ["Roguelike", "Indie", "Action"], excerpt: "A god-like rogue-lite dungeon crawler." },
    { id: "g8", title: "Final Fantasy XVI", slug: "ff16", developer: "Square Enix", publisher: "Square Enix", status: "published", metacriticScore: 87, userRating: 8.5, releaseDate: "2023-06-22", coverArtUrl: null, platforms: ["PS5", "PC"], tags: ["RPG", "Action"], excerpt: "An all-new Final Fantasy adventure." },
    { id: "g9", title: "Starfield", slug: "starfield", developer: "Bethesda", publisher: "Bethesda Softworks", status: "archived", metacriticScore: 83, userRating: 6.9, releaseDate: "2023-09-06", coverArtUrl: null, platforms: ["PC", "XSX"], tags: ["RPG", "Open World", "Sci-Fi"], excerpt: "Explore the galaxy in Bethesda's epic." },
    { id: "g10", title: "Black Myth: Wukong", slug: "black-myth-wukong", developer: "Game Science", publisher: "Game Science", status: "published", metacriticScore: 82, userRating: 8.2, releaseDate: "2024-08-20", coverArtUrl: null, platforms: ["PC", "PS5"], tags: ["Action", "Soulslike"], excerpt: "An action RPG rooted in Chinese mythology." },
  ];

  const posts: PostRow[] = [
    { id: "p1", title: "Welcome to GremiusCMS", slug: "welcome-to-gremiuscms", status: "published", authorName: "Admin", publishedAt: "2025-02-10T12:00:00Z", readingTime: 3, tags: ["Announcement"], excerpt: "Introducing GremiusCMS — the high-performance gaming CMS." },
    { id: "p2", title: "Top 10 RPGs of 2024", slug: "top-10-rpgs-2024", status: "published", authorName: "Admin", publishedAt: "2025-01-15T09:00:00Z", readingTime: 8, tags: ["RPG", "Ranking"], excerpt: "Our definitive ranking of the best RPGs released this year." },
    { id: "p3", title: "GTA VI Preview: Everything We Know", slug: "gta-vi-preview", status: "draft", authorName: "Admin", publishedAt: null, readingTime: 12, tags: ["Preview", "Open World"], excerpt: "A comprehensive look at the most anticipated game of the decade." },
    { id: "p4", title: "Elden Ring DLC Guide: Shadow of the Erdtree", slug: "elden-ring-dlc-guide", status: "published", authorName: "Admin", publishedAt: "2024-06-21T10:00:00Z", readingTime: 15, tags: ["Guide", "Soulslike"], excerpt: "Complete walkthrough for the Shadow of the Erdtree expansion." },
    { id: "p5", title: "The Future of Cloud Gaming in 2025", slug: "cloud-gaming-2025", status: "scheduled", authorName: "Admin", publishedAt: "2025-03-01T08:00:00Z", readingTime: 7, tags: ["Opinion", "Technology"], excerpt: "Why cloud gaming will finally become mainstream." },
  ];

  const streamers: StreamerRow[] = [
    { id: "s1", displayName: "Kai Cenat", slug: "kai-cenat", platform: "twitch", isLive: true, viewerCount: 185420, followerCount: 14200000, currentStreamTitle: "MAFIATHON 2 DAY 30 🔥 BIGGEST STREAM EVER", avatarUrl: null },
    { id: "s2", displayName: "xQc", slug: "xqc", platform: "kick", isLive: true, viewerCount: 72300, followerCount: 11800000, currentStreamTitle: "REACTING TO EVERYTHING | GAMING LATER", avatarUrl: null },
    { id: "s3", displayName: "Shroud", slug: "shroud", platform: "twitch", isLive: false, viewerCount: 0, followerCount: 10200000, currentStreamTitle: null, avatarUrl: null },
    { id: "s4", displayName: "Pokimane", slug: "pokimane", platform: "twitch", isLive: false, viewerCount: 0, followerCount: 9400000, currentStreamTitle: null, avatarUrl: null },
    { id: "s5", displayName: "IShowSpeed", slug: "ishowspeed", platform: "youtube", isLive: true, viewerCount: 94500, followerCount: 28000000, currentStreamTitle: "SPEED IS LIVE FROM JAPAN 🇯🇵", avatarUrl: null },
  ];

  return { games, posts, streamers };
}
