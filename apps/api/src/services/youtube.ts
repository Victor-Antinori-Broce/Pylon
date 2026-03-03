/**
 * YouTube Service - Videos and trailers
 */

const YT_API_URL = "https://www.googleapis.com/youtube/v3";

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  channelTitle: string;
  viewCount: number;
  duration: string;
}

async function ytFetch<T>(endpoint: string, params: string): Promise<T> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YouTube API key not configured");
  const response = await fetch(`${YT_API_URL}${endpoint}?key=${apiKey}&${params}`);
  if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function searchTrailers(gameName: string, maxResults = 5): Promise<YouTubeVideo[]> {
  const query = encodeURIComponent(`${gameName} official trailer`);
  const data = await ytFetch<{
    items: Array<{
      id: { videoId: string };
      snippet: { title: string; description: string; thumbnails: { high: { url: string } }; publishedAt: string; channelTitle: string };
    }>;
  }>("/search", `q=${query}&part=snippet&type=video&maxResults=${maxResults}&order=relevance`);

  if (!data.items?.length) return [];

  const videoIds = data.items.map((i) => i.id.videoId).join(",");
  const details = await ytFetch<{
    items: Array<{ id: string; statistics: { viewCount: string }; contentDetails: { duration: string } }>;
  }>("/videos", `id=${videoIds}&part=statistics,contentDetails`);

  const detailsMap = new Map(details.items.map((d) => [d.id, d]));

  return data.items.map((item) => {
    const detail = detailsMap.get(item.id.videoId);
    return {
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnailUrl: item.snippet.thumbnails.high.url,
      publishedAt: item.snippet.publishedAt,
      channelTitle: item.snippet.channelTitle,
      viewCount: detail ? parseInt(detail.statistics.viewCount, 10) : 0,
      duration: detail?.contentDetails.duration ?? "",
    };
  });
}

export async function getLatestVideos(channelId: string, maxResults = 10): Promise<YouTubeVideo[]> {
  const data = await ytFetch<{
    items: Array<{
      id: { videoId: string };
      snippet: { title: string; description: string; thumbnails: { high: { url: string } }; publishedAt: string; channelTitle: string };
    }>;
  }>("/search", `channelId=${channelId}&part=snippet&type=video&maxResults=${maxResults}&order=date`);

  return data.items.map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnailUrl: item.snippet.thumbnails.high.url,
    publishedAt: item.snippet.publishedAt,
    channelTitle: item.snippet.channelTitle,
    viewCount: 0,
    duration: "",
  }));
}

export function isYouTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}
