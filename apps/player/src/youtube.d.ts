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

  class Player {
    constructor(element: string | HTMLElement, options: PlayerOptions);
    loadVideoById(videoId: string): void;
    stopVideo(): void;
    destroy(): void;
  }
}

interface Window {
  onYouTubeIframeAPIReady?: () => void;
}
