/**
 * What to say to whoever is looking at the screen, from their own clock.
 *
 * Used by the noticeboard in the drawing and by the dashboard banner, so both
 * say the same thing at the same moment.
 */
export function greeting(at = new Date()) {
  const hour = at.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
