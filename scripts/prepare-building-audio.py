"""Short CC0 building confirmation recordings. No synthesis or pitch shifting."""
from pathlib import Path
import sys
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.local/audio-tools'))
import soundfile as sf
for name,start,length in [('horse',0,1.67),('hall',6,1.8),('forge',0,1.5),('chant',5,2.1)]:
 x,sr=sf.read(ROOT/'.local/audio-source/v28'/(name+'.mp3'))
 if x.ndim==2:x=x.mean(axis=1)
 x=x[int(start*sr):int((start+length)*sr)].copy();x-=x.mean()
 x*=.7/max(.00001,float(np.max(np.abs(x))))
 fade=min(int(sr*.045),len(x)//4)
 x[:fade]*=np.linspace(0,1,fade);x[-fade:]*=np.linspace(1,0,fade)
 sf.write(ROOT/'public/audio'/('building-'+name+'.wav'),x,sr,subtype='PCM_16')
 print(name,len(x)/sr)
