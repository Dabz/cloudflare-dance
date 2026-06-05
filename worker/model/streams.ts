export interface StreamVideo {
    id: string;
    thumbnail: string;
    readyToStream: boolean;
    meta: Record<string, string>;
    size: number;
    preview?: string;
    duration: number;
    hlsPlaybackUrl: string;
    dashPlaybackUrl: string
}

