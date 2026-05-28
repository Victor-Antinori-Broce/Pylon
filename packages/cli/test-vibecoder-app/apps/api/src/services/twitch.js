/**
 * Twitch Service - Streamer live status and info
 */
let cachedToken = null;
async function getAccessToken() {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret)
        throw new Error("Twitch credentials not configured");
    if (cachedToken && cachedToken.expires_at > Date.now())
        return cachedToken.access_token;
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: "POST" });
    if (!response.ok)
        throw new Error(`Twitch auth failed: ${response.status}`);
    const data = (await response.json());
    cachedToken = {
        access_token: data.access_token,
        expires_at: Date.now() + data.expires_in * 1000 - 60_000,
    };
    return cachedToken.access_token;
}
async function twitchFetch(endpoint) {
    const token = await getAccessToken();
    const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            "Client-Id": process.env.TWITCH_CLIENT_ID,
        },
    });
    if (!response.ok)
        throw new Error(`Twitch API error: ${response.status}`);
    return response.json();
}
export async function getStreamStatus(channelIds) {
    const result = new Map();
    if (!channelIds.length)
        return result;
    const params = channelIds.map((id) => `user_id=${id}`).join("&");
    const data = await twitchFetch(`/streams?${params}`);
    for (const s of data.data) {
        result.set(s.user_id, {
            isLive: true,
            title: s.title,
            viewerCount: s.viewer_count,
            thumbnailUrl: s.thumbnail_url.replace("{width}", "440").replace("{height}", "248"),
            gameName: s.game_name,
        });
    }
    return result;
}
export async function getUserInfo(channelIds) {
    const result = new Map();
    if (!channelIds.length)
        return result;
    const params = channelIds.map((id) => `id=${id}`).join("&");
    const data = await twitchFetch(`/users?${params}`);
    for (const u of data.data) {
        result.set(u.id, {
            id: u.id,
            displayName: u.display_name,
            profileImageUrl: u.profile_image_url,
            followerCount: 0,
        });
    }
    return result;
}
export function isTwitchConfigured() {
    return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}
//# sourceMappingURL=twitch.js.map