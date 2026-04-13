import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

let apiLoaded = false;
let apiReady = false;
const readyCallbacks = [];

function loadYouTubeApi() {
  if (apiLoaded) return;
  apiLoaded = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
  };
}

function onApiReady(cb) {
  if (apiReady) { cb(); return; }
  readyCallbacks.push(cb);
  loadYouTubeApi();
}

function YouTubePlayerInner({ youtubeId, startTime, endTime, disabled, onEnded, autoPlay }, ref) {
  // Outer div is what React owns. YT.Player replaces an inner target div that
  // we create imperatively; that keeps React's ref-tracked node intact so
  // unmount/remount across phase transitions stays clean.
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  const [ready, setReady] = useState(false);

  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  function stopEndTimeMonitor() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startEndTimeMonitor() {
    stopEndTimeMonitor();
    intervalRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      if (p.getCurrentTime() >= endTime) {
        p.pauseVideo();
        stopEndTimeMonitor();
        if (onEndedRef.current) onEndedRef.current();
      }
    }, 250);
  }

  useEffect(() => {
    let cancelled = false;

    onApiReady(() => {
      if (cancelled) return;
      if (!containerRef.current) return;

      // Fresh child element for YT to replace. Using a stable parent (containerRef)
      // means React never loses track of its own DOM subtree.
      const target = document.createElement('div');
      containerRef.current.appendChild(target);

      playerRef.current = new window.YT.Player(target, {
        width: 300,
        height: 170,
        videoId: youtubeId,
        playerVars: { start: Math.floor(startTime), end: Math.ceil(endTime), controls: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            setReady(true);
            if (autoPlay && playerRef.current) {
              playerRef.current.playVideo();
            }
          },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              startEndTimeMonitor();
            } else {
              stopEndTimeMonitor();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      stopEndTimeMonitor();
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch (_) { /* ignore */ }
      }
      playerRef.current = null;
      // Clear any lingering iframe/child inside the container so the next
      // mount starts with a clean slate.
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [youtubeId, startTime, endTime]);

  useEffect(() => {
    if (disabled && playerRef.current) {
      stopEndTimeMonitor();
      try { playerRef.current.stopVideo(); } catch (_) { /* ignore */ }
    }
  }, [disabled]);

  function handlePlay() {
    // loadVideoById reliably starts at startSeconds even after stopVideo(),
    // unlike seekTo() which may not honor the seek until playback actually begins.
    if (playerRef.current && playerRef.current.loadVideoById) {
      playerRef.current.loadVideoById({
        videoId: youtubeId,
        startSeconds: Math.floor(startTime),
        endSeconds: Math.ceil(endTime),
      });
    }
  }

  function handleStop() {
    stopEndTimeMonitor();
    try { playerRef.current?.stopVideo?.(); } catch (_) {}
  }

  useImperativeHandle(ref, () => ({ play: handlePlay, stop: handleStop }), [youtubeId, startTime, endTime]);

  // Keep the container mounted regardless of `disabled` so the main useEffect
  // (which bails out if containerRef.current is null) can always create the
  // YT.Player. Hide the container when disabled and show a notice instead —
  // but never unmount it, or a disabled→enabled flip would leave us with no
  // player and no way to create one (useEffect doesn't re-fire when only
  // `disabled` changes).
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        ref={containerRef}
        style={{ minHeight: disabled ? 0 : 170, display: disabled ? 'none' : 'block' }}
      />
      {disabled ? (
        <p style={{ color: '#888', fontStyle: 'italic', margin: 0 }}>音樂已停止（錄音中）</p>
      ) : (
        ready && (
          <>
            <button onClick={handlePlay} style={{ marginTop: 8, padding: '6px 16px', fontSize: 14 }}>
              🔁 重播片段
            </button>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>
              請使用上方按鈕重播，直接點影片可能無法播放正確片段
            </p>
          </>
        )
      )}
    </div>
  );
}

const YouTubePlayer = forwardRef(YouTubePlayerInner);
export default YouTubePlayer;
