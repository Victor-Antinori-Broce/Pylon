/**
 * IGDB Service - Internet Game Database integration
 * Uses IGDB API v4 (Twitch-authenticated)
 */
const IGDB_API_URL = "https://api.igdb.com/v4";
let igdbToken = null;
async function getIGDBToken() {
    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;
    if (!clientId || !clientSecret)
        throw new Error("IGDB credentials not configured");
    if (igdbToken && igdbToken.expires_at > Date.now())
        return igdbToken.access_token;
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: "POST" });
    const data = (await response.json());
    igdbToken = {
        access_token: data.access_token,
        expires_at: Date.now() + data.expires_in * 1000 - 60_000,
    };
    return igdbToken.access_token;
}
async function igdbQuery(endpoint, body) {
    const token = await getIGDBToken();
    const response = await fetch(`${IGDB_API_URL}${endpoint}`, {
        method: "POST",
        headers: {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            "Client-ID": process.env.IGDB_CLIENT_ID,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
        },
        body,
    });
    if (!response.ok)
        throw new Error(`IGDB API error: ${response.status}`);
    return response.json();
}
export async function searchGames(query, limit = 10) {
    return igdbQuery("/games", 
    // eslint-disable-next-line max-len
    `search "${query}"; fields name,slug,summary,rating,aggregated_rating,first_release_date,cover.url,platforms.name,platforms.abbreviation,genres.name,screenshots.url,videos.video_id,videos.name; limit ${limit};`);
}
export async function getGameById(id) {
    const results = await igdbQuery("/games", 
    // eslint-disable-next-line max-len
    `where id = ${id}; fields name,slug,summary,storyline,rating,aggregated_rating,first_release_date,cover.url,platforms.name,platforms.abbreviation,genres.name,screenshots.url,videos.video_id,videos.name;`);
    return results[0] || null;
}
export async function getPopularGames(limit = 20) {
    const sixMonthsAgo = Math.floor(Date.now() / 1000) - 6 * 30 * 24 * 60 * 60;
    return igdbQuery("/games", 
    // eslint-disable-next-line max-len
    `where first_release_date > ${sixMonthsAgo} & rating > 70; fields name,slug,summary,rating,aggregated_rating,first_release_date,cover.url,platforms.name,genres.name; sort rating desc; limit ${limit};`);
}
export function transformIGDBGame(igdbGame) {
    return {
        title: igdbGame.name,
        slug: igdbGame.slug,
        excerpt: igdbGame.summary?.slice(0, 300),
        metacriticScore: igdbGame.aggregated_rating ? Math.round(igdbGame.aggregated_rating) : undefined,
        releaseDate: igdbGame.first_release_date
            ? new Date(igdbGame.first_release_date * 1000).toISOString().split("T")[0]
            : undefined,
        externalIds: { igdbId: igdbGame.id },
        trailerUrl: igdbGame.videos?.[0] ? `https://www.youtube.com/watch?v=${igdbGame.videos[0].video_id}` : undefined,
    };
}
export function isIGDBConfigured() {
    return Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
}
//# sourceMappingURL=igdb.js.map