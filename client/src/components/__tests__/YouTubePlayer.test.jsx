import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import YouTubePlayer from '../YouTubePlayer.jsx';

// FakePlayer simulates YT.Player: replaces its target element with an iframe
// (exactly as the real API does) and fires onReady asynchronously.
let players = [];
let nextPlayerId = 1;

class FakePlayer {
  constructor(target, opts) {
    this.id = nextPlayerId++;
    this.opts = opts;
    this.target = target;
    this.destroyed = false;
    const iframe = document.createElement('iframe');
    iframe.dataset.fakeYt = String(this.id);
    if (target && target.parentNode) {
      target.parentNode.replaceChild(iframe, target);
      this.iframe = iframe;
    }
    players.push(this);
    queueMicrotask(() => {
      if (!this.destroyed && opts.events && opts.events.onReady) {
        opts.events.onReady();
      }
    });
  }
  playVideo() {}
  pauseVideo() {}
  stopVideo() {}
  seekTo() {}
  getCurrentTime() { return 0; }
  destroy() {
    this.destroyed = true;
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
  }
}

async function flushApiAndMicrotasks() {
  // On first render the component queues its cb inside onApiReady; fire the
  // global ready hook the YT script would call, then yield so microtasks run.
  await act(async () => {
    if (typeof window.onYouTubeIframeAPIReady === 'function') {
      window.onYouTubeIframeAPIReady();
    }
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  players = [];
  nextPlayerId = 1;
  window.YT = {
    Player: FakePlayer,
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
  };
  // Swallow the real script-tag append so jsdom doesn't try to fetch YouTube.
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('YouTubePlayer', () => {
  it('creates a YT.Player whose iframe lives inside the React-owned container', async () => {
    const { container } = render(
      <YouTubePlayer youtubeId="A" startTime={0} endTime={10} />
    );
    await flushApiAndMicrotasks();

    expect(players.length).toBe(1);
    expect(players[0].opts.videoId).toBe('A');

    const outer = container.querySelector('[style*="min-height"]');
    expect(outer).toBeTruthy();
    const iframe = outer.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.dataset.fakeYt).toBe(String(players[0].id));
  });

  it('destroys the YT.Player and empties the container on unmount', async () => {
    const { container, unmount } = render(
      <YouTubePlayer youtubeId="A" startTime={0} endTime={10} />
    );
    await flushApiAndMicrotasks();
    const player = players[0];

    unmount();

    expect(player.destroyed).toBe(true);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('remount via key change creates a fresh player whose iframe is rendered', async () => {
    function Host({ videoId, k }) {
      return <YouTubePlayer key={k} youtubeId={videoId} startTime={0} endTime={10} />;
    }
    const { rerender, container } = render(<Host videoId="A" k="k-A" />);
    await flushApiAndMicrotasks();
    expect(players.length).toBe(1);
    const first = players[0];

    rerender(<Host videoId="B" k="k-B" />);
    await flushApiAndMicrotasks();

    expect(first.destroyed).toBe(true);
    expect(players.length).toBe(2);
    expect(players[1].opts.videoId).toBe('B');
    expect(players[1].destroyed).toBe(false);

    const outer = container.querySelector('[style*="min-height"]');
    const iframe = outer.querySelector('iframe');
    expect(iframe).toBeTruthy();
    // Crucial: the iframe the user actually sees corresponds to the NEW player,
    // not a detached one from the first mount.
    expect(iframe.dataset.fakeYt).toBe(String(players[1].id));
  });

  it('prop-level youtubeId change (no key) re-creates the player and keeps iframe attached', async () => {
    const { rerender, container } = render(
      <YouTubePlayer youtubeId="A" startTime={0} endTime={10} />
    );
    await flushApiAndMicrotasks();
    const first = players[0];

    rerender(<YouTubePlayer youtubeId="B" startTime={0} endTime={10} />);
    await flushApiAndMicrotasks();

    expect(first.destroyed).toBe(true);
    expect(players.length).toBe(2);
    expect(players[1].opts.videoId).toBe('B');

    const outer = container.querySelector('[style*="min-height"]');
    const iframe = outer.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.dataset.fakeYt).toBe(String(players[1].id));
  });

  it('replay button appears after onReady fires', async () => {
    const { findByText } = render(
      <YouTubePlayer youtubeId="A" startTime={0} endTime={10} />
    );
    await flushApiAndMicrotasks();
    const btn = await findByText(/重播片段/);
    expect(btn).toBeTruthy();
  });

  it('disabled=true shows stopped notice', () => {
    const { getByText } = render(
      <YouTubePlayer youtubeId="A" startTime={0} endTime={10} disabled />
    );
    expect(getByText(/音樂已停止/)).toBeTruthy();
  });

  // Regression: if the component is first rendered with disabled=true (e.g.,
  // user was still in the "recording" UI state from phase 0 when phase 1's
  // phase-start arrives with a new key), and then disabled flips to false,
  // the YT.Player MUST appear. Previously this failed because the container
  // ref was absent from the DOM on first mount, so the useEffect bailed out
  // and never re-fired when disabled changed.
  it('disabled=true on first mount, then flipping to false, still creates the player', async () => {
    const { rerender, container, findByText } = render(
      <YouTubePlayer youtubeId="A" startTime={0} endTime={10} disabled />
    );
    await flushApiAndMicrotasks();

    rerender(<YouTubePlayer youtubeId="A" startTime={0} endTime={10} disabled={false} />);
    await flushApiAndMicrotasks();

    expect(players.length).toBe(1);
    const btn = await findByText(/重播片段/);
    expect(btn).toBeTruthy();
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.dataset.fakeYt).toBe(String(players[0].id));
  });
});
