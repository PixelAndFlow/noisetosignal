// Loads YouTube's official IFrame Player API script exactly once per page
// session, regardless of how many times a component using it mounts (e.g.
// navigating between videos client-side). Needed for a real player object
// (getCurrentTime/seekTo/playVideo/etc.) — the alternative, guessing at
// postMessage command names against a plain <iframe>, isn't part of
// YouTube's documented protocol and can't reliably report playback
// position, which resume-playback depends on.
let apiReadyPromise = null;

export function loadYouTubeIframeAPI() {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === 'function') previousCallback();
      resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });

  return apiReadyPromise;
}
