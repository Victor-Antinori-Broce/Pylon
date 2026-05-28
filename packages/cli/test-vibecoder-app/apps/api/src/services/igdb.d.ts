/**
 * IGDB Service - Internet Game Database integration
 * Uses IGDB API v4 (Twitch-authenticated)
 */
/** IGDB Platform data */
interface IGDBPlatform {
    name: string;
    abbreviation: string;
}
/** IGDB Genre data */
interface IGDBGenre {
    name: string;
}
/** IGDB Cover data */
interface IGDBCover {
    url: string;
}
/** IGDB Screenshot data */
interface IGDBScreenshot {
    url: string;
}
/** IGDB Video data */
interface IGDBVideo {
    video_id: string;
    name: string;
}
/** IGDB Game data structure */
export interface IGDBGame {
    id: number;
    name: string;
    slug: string;
    summary?: string;
    storyline?: string;
    rating?: number;
    aggregated_rating?: number;
    first_release_date?: number;
    cover?: IGDBCover;
    platforms?: IGDBPlatform[];
    genres?: IGDBGenre[];
    screenshots?: IGDBScreenshot[];
    videos?: IGDBVideo[];
}
/** Transformed game data */
export interface TransformedGameData {
    title: string;
    slug: string;
    excerpt: string | undefined;
    metacriticScore: number | undefined;
    releaseDate: string | undefined;
    externalIds: {
        igdbId: number;
    };
    trailerUrl: string | undefined;
}
export declare function searchGames(query: string, limit?: number): Promise<IGDBGame[]>;
export declare function getGameById(id: number): Promise<IGDBGame | null>;
export declare function getPopularGames(limit?: number): Promise<IGDBGame[]>;
export declare function transformIGDBGame(igdbGame: IGDBGame): TransformedGameData;
export declare function isIGDBConfigured(): boolean;
export {};
//# sourceMappingURL=igdb.d.ts.map