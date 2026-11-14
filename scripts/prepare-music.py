#!/usr/bin/env python3
"""Prepare in-game background music from the source library in music/.

Source files in music/ stay untouched. For each track: trim leading/trailing
silence, two-pass EBU R128 loudness normalisation to the level of the existing
bards-tale.mp3 (about -17.5 LUFS, true peak <= -1.5 dBTP), short edge fades,
then 44.1 kHz stereo MP3 at 128 kbps for mobile download size.
Requires ffmpeg. Run from the repository root: python3 scripts/prepare-music.py
"""
import json, subprocess, sys
from pathlib import Path

TRACKS = {  # source in music/ -> output in public/audio/music/
    'kings-orchard-a.mp3': 'kings-orchard.mp3',
    'sunlight-on-the-orchard-b.mp3': 'sunlight-orchard.mp3',
    'cobblestone-celebration-c.mp3': 'cobblestone-celebration.mp3',
    'unseen-gambit-tension-a.mp3': 'unseen-gambit.mp3',
}
TARGET, PEAK, LRA = -17.5, -1.5, 11
TRIM = ('silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05,'
        'areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05,areverse')

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

def measure(src):
    out = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(src), '-af',
               f'{TRIM},loudnorm=I={TARGET}:TP={PEAK}:LRA={LRA}:print_format=json', '-f', 'null', '-']).stderr
    return json.loads(out[out.rindex('{'):out.rindex('}') + 1])

def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)]).stdout)

def main():
    root = Path(__file__).resolve().parent.parent
    out_dir = root / 'public/audio/music'
    out_dir.mkdir(parents=True, exist_ok=True)
    for src_name, out_name in TRACKS.items():
        src, dst = root / 'music' / src_name, out_dir / out_name
        m = measure(src)
        norm = (f"loudnorm=I={TARGET}:TP={PEAK}:LRA={LRA}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
                f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
        tmp = dst.with_suffix('.tmp.wav')
        run(['ffmpeg', '-y', '-hide_banner', '-i', str(src), '-af', f'{TRIM},{norm},aresample=44100', str(tmp)])
        d = duration(tmp)
        run(['ffmpeg', '-y', '-hide_banner', '-i', str(tmp), '-af', f'afade=t=in:d=0.4,afade=t=out:st={d - 1.2:.3f}:d=1.2',
             '-ac', '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', str(dst)])
        tmp.unlink()
        print(f'{out_name}: {duration(dst):.1f} s, {dst.stat().st_size / 1048576:.2f} MiB')

if __name__ == '__main__':
    sys.exit(main())
