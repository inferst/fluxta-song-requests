/**
 * The part of YouTube's IFrame Player API the page uses
 * (https://developers.google.com/youtube/iframe_api_reference).
 */
declare namespace YT {
  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    /** -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
    data: number;
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number;
  }

  interface PlayerOptions {
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: OnErrorEvent) => void;
    };
  }

  /**
   * What `getVideoData()` gives — not in YouTube's reference, but the
   * player's own description of the video it holds.
   */
  interface VideoData {
    video_id?: string;
    /** Whether the video is a live stream. */
    isLive?: boolean;
  }

  class Player {
    constructor(element: string | HTMLElement, options: PlayerOptions);
    loadVideoById(videoId: string): void;
    loadVideoById(video: { videoId: string; startSeconds?: number }): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    mute(): void;
    unMute(): void;
    /**
     * In seconds; 0 until the video's data has loaded. For a live stream, how
     * long it has been on.
     */
    getDuration(): number;
    getVideoData(): VideoData;
    destroy(): void;
  }
}

interface Window {
  onYouTubeIframeAPIReady?: () => void;
}
