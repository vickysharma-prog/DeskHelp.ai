#!/usr/bin/env bash
# Turns the recorded tour into the GIF the README leads with.
#
# A GIF rather than a video tag: a GIF plays wherever a README is read, and
# <video> only works on github.com itself.
#
# Two passes, because a single-pass GIF picks its 256 colours from the first
# frame and the gradients band badly. The first pass builds a palette from the
# whole clip; the second uses it.
set -euo pipefail

FF=$(find "$LOCALAPPDATA/Microsoft/WinGet/Packages" -name ffmpeg.exe 2>/dev/null | head -1)
[ -z "$FF" ] && FF=ffmpeg

IN=.local/recording/tour.webm
OUT=assets/screens/tour.gif
# Nine frames a second reads as motion without paying for twelve. 820 wide is
# what GitHub shows a README image at. 160 colours rather than 256 halves the
# file and the banding is not visible on these flat surfaces.
FPS=${FPS:-9}
WIDTH=${WIDTH:-820}
COLORS=${COLORS:-160}
# The recorder signs in before the tour, which takes a few seconds on a page
# the tour is not about. Those seconds are dropped here rather than there,
# because the browser has to load that page either way.
START=${START:-6.3}

# The cut is a filter rather than -ss, because the second pass has two inputs
# and -ss there would be read as an option on whichever input followed it.
CUT="trim=start=$START,setpts=PTS-STARTPTS"

"$FF" -y -v error -i "$IN" \
  -vf "$CUT,fps=$FPS,scale=$WIDTH:-1:flags=lanczos,palettegen=max_colors=$COLORS:stats_mode=diff" \
  .local/recording/palette.png

"$FF" -y -v error -i "$IN" -i .local/recording/palette.png \
  -lavfi "[0:v]$CUT,fps=$FPS,scale=$WIDTH:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$OUT"

echo "  $OUT  $(du -k "$OUT" | cut -f1) KB"
