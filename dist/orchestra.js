/* Original modal score, plucked string model and layered material sounds. */
(()=>{
'use strict';
const A=window.KingdomArt;let context,fxBus,musicBus,noiseBuffer,muted=false,musicEnabled=true,paused=false,fxVolume=.55,musicVolume=.27,nextNote=0,step=0;const recent={},cache=new Map();
function init(){if(context)return;context=new(window.AudioContext||window.webkitAudioContext)();const compressor=context.createDynamicsCompressor();compressor.threshold.value=-19;compressor.knee.value=20;compressor.ratio.value=5;compressor.connect(context.destination);fxBus=context.createGain();musicBus=context.createGain();fxBus.connect(compressor);musicBus.connect(compressor);const delay=context.createDelay(1),echo=context.createGain();delay.delayTime.value=.19;echo.gain.value=.12;musicBus.connect(delay);delay.connect(echo);echo.connect(compressor);noiseBuffer=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;levels();nextNote=context.currentTime+.08;setInterval(schedule,120)}
function levels(){if(!context)return;const t=context.currentTime;fxBus.gain.setTargetAtTime(muted||document.hidden?0:fxVolume,t,.035);musicBus.gain.setTargetAtTime(!musicEnabled||document.hidden?0:musicVolume*(paused?.22:1),t,.2)}
A.audioStart=()=>{try{init();if(context.state==='suspended')context.resume().catch(()=>{});schedule()}catch{}};
A.toggleSound=()=>{muted=!muted;A.audioStart();levels();return !muted};A.audioPause=v=>{paused=v;levels()};
A.setAudio=o=>{if(o.fx!==undefined)fxVolume=o.fx;if(o.music!==undefined)musicVolume=o.music;if(o.musicEnabled!==undefined)musicEnabled=o.musicEnabled;A.audioStart();levels();try{localStorage.setItem('kingdom-audio-v2',JSON.stringify({fx:fxVolume,music:musicVolume,musicEnabled}))}catch{}};
A.audioStatus=()=>({state:context?.state||'waiting-for-gesture',muted,musicEnabled,fx:fxVolume,music:musicVolume,events:Object.keys(recent).length,scoreStep:step,voicesCached:cache.size});
try{const o=JSON.parse(localStorage.getItem('kingdom-audio-v2'));if(o){fxVolume=Math.min(1,Math.max(0,o.fx??.55));musicVolume=Math.min(.7,Math.max(0,o.music??.27));musicEnabled=o.musicEnabled!==false}}catch{}document.addEventListener('visibilitychange',levels);
function envelope(src,at,duration,volume,pan=0,bus=fxBus,attack=.004){const gain=context.createGain(),nodes=[src,gain];gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+attack);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);src.connect(gain);if(context.createStereoPanner){const p=context.createStereoPanner();p.pan.value=Math.max(-.85,Math.min(.85,pan));gain.connect(p);p.connect(bus);nodes.push(p)}else gain.connect(bus);src.onended=()=>nodes.forEach(n=>{try{n.disconnect()}catch{}});src.start(at);src.stop(at+duration+.03)}
function tone(f,end,dur,vol,pan=0,type='sine',at=context.currentTime,bus=fxBus,attack=.004){const o=context.createOscillator();o.type=type;o.frequency.setValueAtTime(f,at);if(end!==f)o.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+dur);envelope(o,at,dur,vol,pan,bus,attack)}
function noise(dur,vol,pan=0,hz=1800,type='lowpass',at=context.currentTime){const src=context.createBufferSource(),filter=context.createBiquadFilter(),g=context.createGain();src.buffer=noiseBuffer;filter.type=type;filter.frequency.value=hz;filter.Q.value=.7;src.connect(filter);g.gain.setValueAtTime(Math.max(.001,vol),at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);filter.connect(g);const p=context.createStereoPanner?.();if(p){p.pan.value=pan;g.connect(p);p.connect(fxBus)}else g.connect(fxBus);src.onended=()=>{src.disconnect();filter.disconnect();g.disconnect();p?.disconnect()};src.start(at,Math.random()*.35);src.stop(at+dur)}
function metal(at,pan=0,scale=1){noise(.055,.22*scale,pan,3400,'highpass',at);for(const [f,v,d]of [[950,.085,.25],[1479,.063,.36],[2201,.039,.17],[3220,.025,.12]])tone(f*(.96+Math.random()*.08),f,.08+d,v*scale,pan,'sine',at)}
function hammer(at,pan=0){noise(.07,.22,pan,850,'bandpass',at);tone(195,91,.11,.22,pan,'triangle',at);tone(410,210,.055,.075,pan,'sine',at+.012)}
function bell(f,at,vol=.12){for(const [ratio,gain,life]of [[1,1,1.5],[2.76,.38,.9],[5.4,.12,.5]])tone(f*ratio,f*ratio,life,vol*gain,0,'sine',at)}
function completion(kind,at){const dock=['dock','shipyard','bath'].includes(kind),fort=['fort','tower','coastbattery'].includes(kind);bell(dock?660:fort?294:523,at,.12);const notes=dock?[62,69,74,78]:fort?[50,57,62,65]:[62,65,69,74];notes.forEach((n,i)=>pluck(n,at+i*.14,1.35,.34,fxBus));noise(.15,.055,0,1600,'lowpass',at)}
function pluck(midi,at,duration=1.6,volume=.3,bus=musicBus){const key=midi+'-'+duration;let buffer=cache.get(key);if(!buffer){const f=440*2**((midi-69)/12),period=Math.round(context.sampleRate/f),length=Math.ceil(context.sampleRate*duration),data=new Float32Array(length);let seed=midi*117+17;for(let i=0;i<period;i++){seed=(seed*16807)%2147483647;data[i]=(seed/2147483647*2-1)*.7}for(let i=period;i<length;i++)data[i]=.496*(data[i-period]+data[i-period+1]);buffer=context.createBuffer(1,length,context.sampleRate);buffer.copyToChannel(data,0);if(cache.size>60)cache.clear();cache.set(key,buffer)}const src=context.createBufferSource();src.buffer=buffer;envelope(src,at,duration,volume,-.22,bus,.003)}
const chords=[[50,57,62,65],[50,57,62,65],[48,55,60,64],[48,55,60,64],[43,55,59,62],[43,55,59,62],[50,57,62,65],[50,57,62,65],[41,53,57,60],[48,55,60,64],[43,55,59,62],[50,57,62,65],[45,57,60,64],[48,55,60,64],[50,57,62,65],[50,57,62,65]];
const melody=[74,77,81,79,76,74,72,76,79,81,79,74,77,76,74,69,77,81,79,76,79,83,81,79,76,74,72,76,77,76,74,74];
function schedule(){if(!context||context.state!=='running')return;const now=context.currentTime;if(nextNote<now-.4)nextNote=now+.05;let count=0;while(nextNote<now+.28&&count++<4){const bar=Math.floor(step/8)%16,pos=step%8,chord=chords[bar];if(musicEnabled&&!document.hidden){pluck(chord[[0,2,1,3,0,2,1,3][pos]]+12,nextNote,1.5,.38);if(pos===0){const freq=440*2**((chord[0]-69)/12);tone(freq,freq,2.9,.025,0,'sine',nextNote,musicBus,.18)}if(pos===0||pos===4){const note=melody[(bar*2+(pos===4?1:0))%32],freq=440*2**((note-69)/12);tone(freq,freq,1.27,.035,.25,'sine',nextNote,musicBus,.13);tone(freq*2,freq*2,1.14,.008,.25,'sine',nextNote,musicBus,.16);tone(106,58,.22,.055,0,'sine',nextNote,musicBus)}if(pos===6)pluck(62,nextNote,.25,.07,musicBus)}nextNote+=.375;step=(step+1)%128}}
A.sound=(kind,pan=0)=>{if(!context||muted||context.state!=='running')return;const at=context.currentTime,interval=['hammer','chop','mine','harvest'].includes(kind)?.16:.065;if(at-(recent[kind]??-10)<interval)return;recent[kind]=at;
if(kind==='melee')metal(at,pan);
else if(kind==='musket'){noise(.12,.55,pan,3700,'lowpass',at);tone(170,48,.23,.26,pan,'triangle',at);noise(.32,.12,pan,1100,'lowpass',at+.04)}
else if(kind==='cannon'||kind==='collapse'){noise(.65,.6,pan,900,'lowpass',at);tone(84,25,.8,.47,pan,'sine',at);noise(.15,.32,pan,3400,'bandpass',at);noise(.8,.12,pan,480,'lowpass',at+.12)}
else if(kind==='grenade'){noise(.4,.4,pan,1700,'lowpass',at);tone(115,34,.4,.3,pan,'sine',at)}
else if(kind==='arrow'){noise(.13,.14,pan,3300,'bandpass',at);pluck(76,at,.13,.2,fxBus)}
else if(kind==='hammer'||kind==='build')hammer(at,pan);
else if(kind==='chop'){hammer(at,pan);noise(.13,.055,pan,1900,'highpass',at+.035)}
else if(kind==='mine')metal(at,pan,.55);
else if(kind==='harvest')noise(.16,.1,pan,1700,'bandpass',at);
else if(kind.startsWith('complete-'))completion(kind.slice(9),at);
else if(kind==='ready'){pluck(69,at,.65,.4,fxBus);pluck(74,at+.09,.8,.4,fxBus)}
else if(kind==='upgrade')completion('fort',at);
else if(kind==='heal'){bell(880,at,.06);bell(1100,at+.12,.04)}
else if(kind==='death'){noise(.25,.18,pan,600,'lowpass',at);tone(130,60,.2,.13,pan,'triangle',at)}
else if(kind==='orderAttack'){metal(at,pan,.26);tone(180,130,.09,.08,pan,'triangle',at)}
else if(kind==='orderGather'){pluck(62,at,.22,.25,fxBus);pluck(69,at+.07,.3,.2,fxBus)}
else if(kind==='invalid')tone(160,110,.13,.09,pan,'triangle',at);
else{noise(.045,.08,pan,700,'bandpass',at);tone(300,240,.07,.04,pan,'sine',at)}
};
})();
