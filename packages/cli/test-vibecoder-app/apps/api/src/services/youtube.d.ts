/**
 * YouTube Service - Videos and trailers
 */
/** YouTube video data structure */
export interface YouTubeVideo {
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    publishedAt: string;
    channelTitle: string;
    viewCount: number;
    duration: string;
}
export declare function searchTrailers(gameName: string, maxResults?: number): Promise<YouTubeVideo[]>;
export declare function getLatestVideos(channelId: string, maxResults?: number): Promise<YouTubeVideo[]>;
export declare function isYouTubeConfigured(): boolean;
//# sourceMappingURL=youtube.d.ts.map