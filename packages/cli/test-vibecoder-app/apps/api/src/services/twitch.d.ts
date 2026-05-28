/**
 * Twitch Service - Streamer live status and info
 */
/** Twitch stream data structure */
export interface TwitchStreamData {
    isLive: boolean;
    title: string;
    viewerCount: number;
    thumbnailUrl: string;
    gameName: string;
}
/** Twitch user data structure */
export interface TwitchUserData {
    id: string;
    displayName: string;
    profileImageUrl: string;
    followerCount: number;
}
export declare function getStreamStatus(channelIds: string[]): Promise<Map<string, TwitchStreamData>>;
export declare function getUserInfo(channelIds: string[]): Promise<Map<string, TwitchUserData>>;
export declare function isTwitchConfigured(): boolean;
//# sourceMappingURL=twitch.d.ts.map