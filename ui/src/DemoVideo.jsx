/**
 * The demo video, on the landing page.
 *
 * Embedded directly rather than behind a click. The player costs about a
 * megabyte on every visit whether or not anybody watches, which is the reason
 * to hold it behind a poster, but this section exists to be watched: somebody
 * who has scrolled to "See a real call, start to finish" has already asked.
 *
 * `youtube-nocookie.com` is still used, so nothing is set until play begins.
 */

export function DemoVideo({ id, title = 'DeskHelp: a real call, start to finish' }) {
  // Before the video is published there is nothing to load, so the frame holds
  // its place with the brand behind it rather than a dead play button.
  if (!id) {
    return (
      <div className="video-frame video-pending" aria-hidden="true">
        <span className="video-label">Demo video</span>
      </div>
    );
  }

  return (
    <div className="video-frame">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
