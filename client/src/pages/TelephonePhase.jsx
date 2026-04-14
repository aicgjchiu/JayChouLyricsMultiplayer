import React, { useState, useRef, useCallback, useEffect } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import YouTubePlayer from '../components/YouTubePlayer.jsx';
import { DistractionScheduler } from '../distraction.js';

export default function TelephonePhase({ phase, timer, lobby, nickname, paused }) {
  const [uiState, setUiState] = useState('listen'); // 'listen' | 'recording' | 'preview' | 'submitted'
  const [audioDisabled, setAudioDisabled] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [submittedPlayers, setSubmittedPlayers] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const recordingAudioRef = useRef(null);
  const autoSubmitOnStopRef = useRef(false);
  const submittedRef = useRef(false);

  const audioLock = lobby?.settings?.audioLockOnRecord ?? true;
  const singalong = lobby?.settings?.singalongEnabled ?? false;
  const distraction = lobby?.settings?.distractionEnabled ?? false;
  const distractionRef = useRef(null);
  const youtubePlayerRef = useRef(null);

  // Reset state when phase changes
  useEffect(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      autoSubmitOnStopRef.current = false;
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
    setUiState('listen');
    setAudioDisabled(false);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setSubmittedPlayers([]);
    autoSubmitOnStopRef.current = false;
    submittedRef.current = false;
  }, [phase?.phaseIndex]);

  useEffect(() => () => {
    if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
  }, []);

  useSocketEvent('player-submitted', useCallback(({ nickname: n }) => {
    setSubmittedPlayers(prev => [...prev, n]);
  }, []));

  useSocketEvent('submit-rejected', useCallback(({ reason }) => {
    if (reason === 'phase-mismatch' || reason === 'wrong-state') {
      submittedRef.current = false;
      setUiState(prev => (recordedBlob ? 'preview' : 'listen'));
      alert('上一輪已結束，你的提交被退回。請在新回合重新錄音。');
    }
  }, [recordedBlob]));

  // Auto-submit on timer expiry
  useEffect(() => {
    if (paused) return;
    if (timer <= 0 && uiState !== 'submitted') {
      handleAutoSubmit();
    }
  }, [timer, paused]);

  function handleAutoSubmit() {
    if (uiState === 'recording' && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Mid-recording: stop the recorder; onstop will submit the resulting blob.
      autoSubmitOnStopRef.current = true;
      mediaRecorderRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
      stopSingalongPlayback();
      return;
    }
    if (recordedBlob) {
      doSubmit(recordedBlob);
    } else {
      doSubmit(null);
    }
  }

  async function handleStartRecording() {
    if (audioLock) setAudioDisabled(true);
    try {
      // When the player will hear concurrent audio (singalong / distraction),
      // disable browser audio processing — echoCancellation + autoGainControl
      // treat the playback as echo and aggressively gate the mic, producing
      // muffled/noisy recordings even with headphones.
      const concurrentAudio = singalong || distraction;
      const audioConstraints = concurrentAudio
        ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        if (autoSubmitOnStopRef.current) {
          autoSubmitOnStopRef.current = false;
          doSubmit(blob);
        } else {
          setUiState('preview');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setUiState('recording');
      if (distraction) {
        distractionRef.current = new DistractionScheduler();
        distractionRef.current.start();
      }
    } catch (err) {
      alert('無法存取麥克風: ' + err.message);
    }
  }

  function stopSingalongPlayback() {
    if (phase?.audioType === 'youtube') {
      try { youtubePlayerRef.current?.stop?.(); } catch (_) {}
    } else if (recordingAudioRef.current) {
      try { recordingAudioRef.current.pause(); } catch (_) {}
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
    stopSingalongPlayback();
  }

  function handleReRecord() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    handleStartRecording();
  }

  function handleSubmit() {
    doSubmit(recordedBlob);
  }

  async function doSubmit(blob) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setUiState('submitted');
    if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
    const phaseIndex = phase.phaseIndex;
    if (blob && blob.size > 0) {
      const arrayBuffer = await blob.arrayBuffer();
      socket.emit('submit-recording', { audioData: arrayBuffer, phaseIndex });
    } else {
      socket.emit('submit-recording', { audioData: new ArrayBuffer(0), phaseIndex });
    }
  }

  if (!phase) return null;

  const timerColor = timer <= 10 ? '#ef4444' : '#1f2937';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, color: '#555' }}>
          第 {phase.phaseIndex + 1} 回合 — {phase.songLabel}
        </span>
        <span style={{ fontSize: 28, fontWeight: 700, color: timerColor }}>⏱ {timer}s</span>
      </div>

      <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>請用提供的歌詞，搭配你聽到的旋律來唱歌</p>
      </div>

      {phase.fallbackNotice && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>⚠️ {phase.fallbackNotice}</p>
        </div>
      )}

      {paused && (
        <div style={{ background: '#fff7ed', border: '2px solid #f97316', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#9a3412' }}>
            ⏸ 已暫停 — 以下玩家斷線：{paused.disconnectedNicknames.join('、')}
          </p>
          {lobby?.hostSocketId === socket.id ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => socket.emit('telephone-continue')}
                style={{ padding: '8px 20px', fontSize: 15, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                不等了，繼續遊戲
              </button>
              <button onClick={() => socket.emit('telephone-wait')}
                style={{ padding: '8px 20px', fontSize: 15, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                等待重連
              </button>
            </div>
          ) : (
            <p style={{ color: '#888', fontSize: 14, margin: 0 }}>等待房主決定...</p>
          )}
        </div>
      )}

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>{phase.lyrics}</p>

        {phase.audioType === 'youtube' ? (
          <YouTubePlayer
            ref={youtubePlayerRef}
            key={`yt-${phase.phaseIndex}-${phase.audioUrl.youtubeId}`}
            youtubeId={phase.audioUrl.youtubeId}
            startTime={phase.audioUrl.startTime}
            endTime={phase.audioUrl.endTime}
            disabled={audioDisabled}
          />
        ) : (
          <>
            {/* Always mount the audio element so imperative play() from 伴唱模式
                works even when audioLock hides the controls. */}
            <audio
              ref={recordingAudioRef}
              src={phase.audioUrl}
              preload="auto"
              style={{ width: '100%', marginBottom: 8, display: audioDisabled ? 'none' : 'block' }}
              controls
            />
            {audioDisabled ? (
              <p style={{ color: '#888', fontStyle: 'italic', margin: 0 }}>音樂已停止（錄音中）</p>
            ) : (
              <button
                onClick={() => { if (recordingAudioRef.current) { recordingAudioRef.current.currentTime = 0; recordingAudioRef.current.play().catch(() => {}); } }}
                style={{ padding: '6px 16px', fontSize: 14 }}>
                🔁 重播
              </button>
            )}
          </>
        )}
      </div>

      {uiState === 'listen' && (
        <div style={{ textAlign: 'center' }}>
          {(singalong || distraction) && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 13, color: '#92400e' }}>
              🎧 建議戴耳機：錄音時若喇叭播放音樂，麥克風會收到回音導致錄音雜亂
            </div>
          )}
          {audioLock && (
            <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>⚠️ 開始錄音後，將無法再聽到音樂</p>
          )}
          <button
            onClick={handleStartRecording}
            style={{ padding: '12px 32px', fontSize: 16, background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            🎤 開始錄音
          </button>
        </div>
      )}

      {uiState === 'recording' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>🔴 錄音中...</p>
          {singalong && (
            <button
              onClick={() => {
                if (phase.audioType === 'youtube') {
                  youtubePlayerRef.current?.play();
                } else if (recordingAudioRef.current) {
                  recordingAudioRef.current.currentTime = 0;
                  recordingAudioRef.current.play().catch(() => {});
                }
              }}
              style={{ padding: '8px 20px', fontSize: 14, background: '#8b5cf6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', marginRight: 8 }}>
              🎵 伴唱模式
            </button>
          )}
          <button
            onClick={handleStopRecording}
            style={{ padding: '10px 24px', fontSize: 15, background: '#333', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            ⏹ 停止錄音
          </button>
        </div>
      )}

      {uiState === 'preview' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#555', marginBottom: 8 }}>試聽你的錄音：</p>
          <audio ref={audioPreviewRef} src={recordedUrl} controls style={{ width: '100%', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={handleReRecord}
              style={{ padding: '8px 20px', fontSize: 15, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              🔄 重錄
            </button>
            <button onClick={handleSubmit}
              style={{ padding: '8px 20px', fontSize: 15, background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              ✅ 提交
            </button>
          </div>
        </div>
      )}

      {uiState === 'submitted' && (
        <p style={{ textAlign: 'center', color: '#22c55e', fontWeight: 600, fontSize: 16 }}>✅ 已提交，等待其他玩家...</p>
      )}

      <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px' }}>其他玩家</p>
        {lobby?.players
          .filter(p => p.nickname !== nickname)
          .map(p => (
            <span key={p.nickname} style={{ marginRight: 12, fontSize: 14 }}>
              {submittedPlayers.includes(p.nickname) ? '✅' : '✍️'} {p.nickname}
            </span>
          ))}
      </div>
    </div>
  );
}
