// Re-exported from existing services — pure fetch, no Payload dependencies
export { searchGames, getGameById, getPopularGames, transformIGDBGame, isIGDBConfigured } from "./igdb";
export { getStreamStatus, getUserInfo, isTwitchConfigured } from "./twitch";
export { searchTrailers, getLatestVideos, isYouTubeConfigured } from "./youtube";
export { uploadFile, deleteFile, fileExists, getFile } from "../lib/storage";
