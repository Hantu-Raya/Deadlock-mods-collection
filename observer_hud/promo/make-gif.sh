#!/usr/bin/env bash
# Observer HUD promo GIF for a GameBanana screenshot slot (at most 6.1 MB; 400x100 to 2560x2048).
# The top 1920x560 of each recording (band, cards, timers, statuses, notices) over a caption strip, plus
# title and end cards; hard cuts (a crossfade makes every pixel change). Inputs: node gif.cjs.
# Usage: bash make-gif.sh [width] [fps] [colors]   -> out/observer_hud_promo_gamebanana.gif
set -euo pipefail
cd "$(dirname "$0")"
W=${1:-960}; F=${2:-8}; C=${3:-80}
A="C:/Users/Administrator/Downloads/clip_1,792,765,386,183.mp4"          # pak10 5e1243e8: ultimate timers
B="C:/Users/Administrator/Documents/Deadlock - 2026-10-23 9-15-03 PM.mp4"  # purchase notices
T0=1.4; T1=2.0; T2=2.6; T3=4.0; T4=1.8
V="fps=$F,format=rgb24,setsar=1"
seg() { echo "crop=1920:560:0:0,setpts=PTS-STARTPTS,fps=$F[v$1];[v$1][g$1]vstack,$V"; }
OUT=out/observer_hud_promo_gamebanana.gif
ffmpeg -v error -y \
  -loop 1 -t $T0 -i out/gif/title.png \
  -ss 8.0 -t $T1 -i "$B" \
  -ss 8.6 -t $T2 -i "$A" \
  -ss 16.0 -t $T3 -i "$A" \
  -loop 1 -t $T4 -i out/gif/end.png \
  -loop 1 -t $T1 -i out/gif/g1.png \
  -loop 1 -t $T2 -i out/gif/g2.png \
  -loop 1 -t $T3 -i out/gif/g3.png \
  -filter_complex "
    [0:v]$V[s0]; [4:v]$V[s4];
    [5:v]fps=$F[g1]; [6:v]fps=$F[g2]; [7:v]fps=$F[g3];
    [1:v]$(seg 1)[s1]; [2:v]$(seg 2)[s2]; [3:v]$(seg 3)[s3];
    [s0][s1][s2][s3][s4]concat=n=5:v=1:a=0,scale=$W:-2:flags=lanczos,split[a][b];
    [a]palettegen=max_colors=$C:stats_mode=diff[p];
    [b][p]paletteuse=dither=bayer:bayer_scale=${BS:-5}:diff_mode=rectangle[out]" \
  -map "[out]" -loop 0 "$OUT"
BYTES=$(stat -c %s "$OUT")
echo "$OUT ${W}px ${F}fps ${C} colours: $BYTES bytes"
