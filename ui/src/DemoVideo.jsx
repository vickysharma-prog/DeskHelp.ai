/**
 * The demo video, on the landing page.
 *
 * Click to play rather than an iframe sitting in the markup. YouTube's embed
 * pulls about a megabyte of player and sets cookies the moment it loads, on
 * every visit, whether or not anybody presses play. A thumbnail costs a few
 * kilobytes and loads the real thing only when somebody asks for it.
 */

import { useState } from 'react';

export function DemoVideo({ id, title = 'DeskHelp: a real call, start to finish' }) {
  const [playing, setPlaying] = useState(false);

  // Before the video is published there is nothing to load, so the frame holds
  // its place with the brand behind it rather than a dead play button.
  if (!id) {
    return (
      <div className="video-frame video-pending" aria-hidden="true">
        <span className="video-label">Demo video</span>
      </div>
    );
  }

  if (playing) {
    return (
      <div className="video-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button className="video-frame video-poster" onClick={() => setPlaying(true)}>
      <img
        src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`}
        alt=""
        loading="lazy"
      />
      <span className="video-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.7-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z" />
        </svg>
      </span>
      <span className="video-label">Watch it place a real call</span>
    </button>
  );
}
