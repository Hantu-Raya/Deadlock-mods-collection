#!/usr/bin/env bash
# Observer HUD promo video: cover card, three captioned gameplay cuts, end card, 0.3 s crossfades.
# Inputs: out/1_cover.png (node render.cjs d1), out/video/*.png (node video.cjs) and the user's recordings.
# Outputs: out/observer_hud_promo.mp4 (H.264 1080p60, no audio) and out/observer_hud_promo.gif (960 px, 15 fps).
set -euo pipefail
cd "$(dirname "$0")"
A="C:/Users/Administrator/Downloads/clip_1,792,765,386,183.mp4"          # pak10 5e1243e8: ultimate timers
B="C:/Users/Administrator/Documents/Deadlock - 2026-10-23 9-15-03 PM.mp4"  # purchase notices (demo bar at the bottom)
X=0.3                                   # crossfade
D0=1.8; D1=2.4; D2=3.2; D3=6.0; D4=2.6  # card, purchases, mid-boss, teamfight, end
O1=$(awk "BEGIN{print $D0 - $X}"); O2=$(awk "BEGIN{print $O1 + $D1 - $X}"); O3=$(awk "BEGIN{print $O2 + $D2 - $X}"); O4=$(awk "BEGIN{print $O3 + $D3 - $X}")
V="fps=60,format=yuv420p,setsar=1"
cap() { echo "format=rgba,fade=in:st=0.15:d=0.25:alpha=1,fade=out:st=$(awk "BEGIN{print $1 - 0.45}"):d=0.25:alpha=1"; }
ffmpeg -v error -y \
  -loop 1 -t $D0 -i out/1_cover.png \
  -ss 8.0 -t $D1 -i "$B" \
  -ss 8.2 -t $D2 -i "$A" \
  -ss 15.8 -t $D3 -i "$A" \
  -loop 1 -t $D4 -i out/video/end.png \
  -loop 1 -t $D1 -i out/video/c1.png \
  -loop 1 -t $D2 -i out/video/c2.png \
  -loop 1 -t $D3 -i out/video/c3.png \
  -filter_complex "
    [0:v]scale=1920:1080,$V[s0];
    [1:v]crop=1806:1016:57:0,scale=1920:1080,setpts=PTS-STARTPTS,$V[b1];
    [2:v]setpts=PTS-STARTPTS,$V[b2];
    [3:v]setpts=PTS-STARTPTS,$V[b3];
    [4:v]scale=1920:1080,$V[s4];
    [5:v]$(cap $D1)[c1]; [6:v]$(cap $D2)[c2]; [7:v]$(cap $D3)[c3];
    [b1][c1]overlay=0:0:shortest=1,$V[s1];
    [b2][c2]overlay=0:0:shortest=1,$V[s2];
    [b3][c3]overlay=0:0:shortest=1,$V[s3];
    [s0][s1]xfade=transition=fade:duration=$X:offset=$O1[x1];
    [x1][s2]xfade=transition=fade:duration=$X:offset=$O2[x2];
    [x2][s3]xfade=transition=fade:duration=$X:offset=$O3[x3];
    [x3][s4]xfade=transition=fade:duration=$X:offset=$O4,format=yuv420p[out]" \
  -map "[out]" -an -c:v libx264 -preset slow -crf 18 -profile:v high -movflags +faststart out/observer_hud_promo.mp4
ffmpeg -v error -y -i out/observer_hud_promo.mp4 -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a" out/observer_hud_promo.gif
ffprobe -v error -show_entries format=duration,size -of default=nw=1 out/observer_hud_promo.mp4
ls -l out/observer_hud_promo.gif | awk '{print "gif bytes", $5}'
# Tumblr (10 MB per GIF): 640 px, 10 fps, 96 colours, ordered dither, only changed rectangles stored.
ffmpeg -v error -y -i out/observer_hud_promo.mp4 -vf "fps=10,scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" out/observer_hud_promo_tumblr.gif
ls -l out/observer_hud_promo_tumblr.gif | awk '{print "tumblr gif bytes", $5}'
