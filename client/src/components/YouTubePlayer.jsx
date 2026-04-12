import React, { useEffect, useRef, useState } from 'react';

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

export default function YouTubePlayer({ youtubeId, startTime, endTime, disabled, onEnded, autoPlay }) {
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
    onApiReady(() => {
      if (!containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        width: 300,
        height: 170,
        videoId: youtubeId,
        playerVars: { start: Math.floor(startTime), end: Math.ceil(endTime), controls: 0, modestbranding: 1 },
        events: {
          onReady: () => {
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
      stopEndTimeMonitor();
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [youtubeId, startTime, endTime]);

  function handlePlay() {
    if (playerRef.current) {
      playerRef.current.seekTo(startTime);
      playerRef.current.playVideo();
    }
  }

  useEffect(() => {
    if (disabled && playerRef.current) {
      stopEndTimeMonitor();
      playerRef.current.stopVideo();
    }
  }, [disabled]);

  if (disabled) {
    return <p style={{ color: '#888', fontStyle: 'italic', textAlign: 'center' }}>音樂已停止（錄音中）</p>;
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div ref={containerRef} />
      {ready && (
        <>
          <button onClick={handlePlay} style={{ marginTop: 8, padding: '6px 16px', fontSize: 14 }}>
            🔁 重播片段
          </button>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>
            請使用上方按鈕重播，直接點影片可能無法播放正確片段
          </p>
        </>
      )}
    </div>
  );
}
