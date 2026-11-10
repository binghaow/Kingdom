#!/bin/bash
# usage: ./build.sh [out.html]   (p7_fx.js and p8_*.js are optional; p8 must precede p6)
cd "$(dirname "$0")/src"
OUT=${1:-../dist/game.html}; mkdir -p ../dist
( cat p1_head.html; echo '<script>'; cat p2_data.js p3_logic.js p4_ai.js p5_render.js; [ -f p7_fx.js ] && cat p7_fx.js; for f in p8_*.js; do [ -f "$f" ] && cat "$f"; done; cat p6_ui.js; echo '</script>'; echo '</body></html>' ) > "$OUT"
node -e "const s=require('fs').readFileSync('$OUT','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('syntax ok',s.length,'bytes')"
