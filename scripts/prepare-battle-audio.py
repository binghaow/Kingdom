"""Trim real CC0 performances, preserve pitch/speed, export browser-safe PCM WAV.

Inputs: .local/audio-source/v27/{horn1,horn2,horn5}.wav and warcry.mp3.
Requires numpy and soundfile; no synthesis, pitch shifting or generated waveforms.
"""
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.local/audio-tools'))
import soundfile as sf

def recording(name):
    x, rate = sf.read(ROOT / '.local/audio-source/v27' / name)
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = x - x.mean()
    return x, rate

def trim(x, rate):
    # RMS windows ignore the quiet recorder tail without cutting the horn's release.
    window = max(1, int(rate * .01))
    energy = np.array([np.sqrt(np.mean(a*a)) for a in np.array_split(x, max(1,len(x)//window))])
    voiced = np.flatnonzero(energy > max(.003, energy.max() * .025))
    if len(voiced):
        first = max(0, int((voiced[0] / len(energy) * len(x))) - int(rate*.025))
        last = min(len(x), int(((voiced[-1]+1) / len(energy) * len(x))) + int(rate*.1))
        x = x[first:last]
    return x

def export(name, x, rate, peak=.78):
    x = x.copy()
    x *= peak / max(.00001, float(np.max(np.abs(x))))
    start = min(len(x), int(rate*.012))
    end = min(len(x), int(rate*.065))
    x[:start] *= np.linspace(0,1,start)
    x[-end:] *= np.linspace(1,0,end)
    sf.write(ROOT/'public/audio'/name, x, rate, subtype='PCM_16')
    print(name, round(len(x)/rate,3), 'seconds; peak', round(float(np.max(np.abs(x))),3))
    return x

horns=[]
for i in [1,2]:
    x, rate = recording('horn'+str(i)+'.wav')
    horns.append((export('charge-horn-'+('a' if i==1 else 'b')+'.wav', trim(x,rate), rate),rate))
x, rate = recording('horn5.wav')
export('battle-alert.wav', x[:int(rate*.82)], rate, .66)
cry, rate = recording('warcry.mp3')
cry=export('battle-cry.wav', trim(cry,rate), rate, .7)
# Review excerpt mirrors the runtime charge layering at unchanged source pitch/speed.
horn, hr = horns[0]
assert hr == rate
mix=np.zeros(max(len(horn),int(rate*.35)+len(cry)))
mix[:len(horn)] += horn*.62
mix[int(rate*.35):int(rate*.35)+len(cry)] += cry*.22
sf.write(ROOT/'public/audio/charge-preview.wav',mix,rate,subtype='PCM_16')
