/**
 * Twitch Service - Streamer live status and info
 */

interface TwitchStreamData { isLive: boolean; title: string; viewerCount: number; thumbnailUrl: string; gameName: string; }
interface TwitchUserData { id: string; displayName: string; profileImageUrl: string; followerCount: number; }

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Twitch credentials not configured");
  if (cachedToken && cachedToken.expires_at > Date.now()) return cachedToken.access_token;

  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!response.ok) throw new Error(`Twitch auth failed: ${response.status}`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 - 60_000 };
  return cachedToken.access_token;
}

async function twitchFetch<T>(endpoint: string): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": process.env.TWITCH_CLIENT_ID! },
  });
  if (!response.ok) throw new Error(`Twitch API error: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getStreamStatus(channelIds: string[]): Promise<Map<string, TwitchStreamData>> {
  const result = new Map<string, TwitchStreamData>();
  if (!channelIds.length) return result;
  const params = channelIds.map((id) => `user_id=${id}`).join("&");
  const data = await twitchFetch<{ data: Array<{ user_id: string; title: string; viewer_count: number; thumbnail_url: string; game_name: string }> }>(`/streams?${params}`);
  for (const s of data.data) {
    result.set(s.user_id, { isLive: true, title: s.title, viewerCount: s.viewer_count, thumbnailUrl: s.thumbnail_url.replace("{width}", "440").replace("{height}", "248"), gameName: s.game_name });
  }
  return result;
}

export async function getUserInfo(channelIds: string[]): Promise<Map<string, TwitchUserData>> {
  const result = new Map<string, TwitchUserData>();
  if (!channelIds.length) return result;
  const params = channelIds.map((id) => `id=${id}`).join("&");
  const data = await twitchFetch<{ data: Array<{ id: string; display_name: string; profile_image_url: string }> }>(`/users?${params}`);
  for (const u of data.data) {
    result.set(u.id, { id: u.id, displayName: u.display_name, profileImageUrl: u.profile_image_url, followerCount: 0 });
  }
  return result;
}

export function isTwitchConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}
