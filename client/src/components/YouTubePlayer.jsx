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

export default function YouTubePlayer({ youtubeId, startTime, endTime, disabled }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onApiReady(() => {
      if (!containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        width: 300,
        height: 170,
        videoId: youtubeId,
        playerVars: { start: Math.floor(startTime), end: Math.ceil(endTime), controls: 0, modestbranding: 1 },
        events: {
          onReady: () => setReady(true),
        },
      });
    });

    return () => {
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
        <button onClick={handlePlay} style={{ marginTop: 8, padding: '6px 16px', fontSize: 14 }}>
          🔁 重播片段
        </button>
      )}
    </div>
  );
}
