/* Small synthesized Foley bank. Starts only after a user gesture. */
(()=>{
const art=window.KingdomArt;let context=null,master=null,muted=false,noiseBuffer=null;const recent={};
art.audioStart=()=>{try{if(!context){context=new(window.AudioContext||window.webkitAudioContext)();master=context.createGain();master.gain.value=.62;master.connect(context.destination);noiseBuffer=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1}if(context.state==='suspended')context.resume().catch(()=>{})}catch{}};
art.toggleSound=()=>{muted=!muted;if(master)master.gain.value=muted?0:.62;return !muted};
art.audioStatus=()=>({state:context?.state||'waiting-for-gesture',muted,events:Object.keys(recent).length});
function connect(source,duration,volume,pan,filter){const now=context.currentTime,g=context.createGain(),nodes=[source,g];g.gain.setValueAtTime(.001,now);g.gain.linearRampToValueAtTime(volume,now+.008);g.gain.exponentialRampToValueAtTime(.001,now+duration);let output=source;if(filter){const f=context.createBiquadFilter();f.type=filter.type;f.frequency.value=filter.hz;f.Q.value=filter.q||.7;output.connect(f);output=f;nodes.push(f)}output.connect(g);if(context.createStereoPanner){const p=context.createStereoPanner();p.pan.value=Math.max(-.8,Math.min(.8,pan||0));g.connect(p);p.connect(master);nodes.push(p)}else g.connect(master);source.onended=()=>nodes.forEach(n=>{try{n.disconnect()}catch{}});source.start(now);source.stop(now+duration+.02)}
function tone(start,end,duration,volume,pan,type='triangle'){const o=context.createOscillator(),now=context.currentTime;o.type=type;o.frequency.setValueAtTime(start,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),now+duration);connect(o,duration,volume,pan)}
function noise(duration,volume,pan,hz=1700,type='lowpass'){const source=context.createBufferSource();source.buffer=noiseBuffer;connect(source,duration,volume,pan,{type,hz})}
art.sound=(kind,pan=0)=>{if(!context||muted||context.state!=='running')return;const now=context.currentTime,interval=['chop','mine','harvest'].includes(kind)?.18:.055;if(now-(recent[kind]??-10)<interval)return;recent[kind]=now;
if(kind==='musket'){noise(.22,.38,pan,2400);tone(115,40,.2,.24,pan,'sawtooth')}
else if(kind==='cannon'||kind==='collapse'){noise(.65,.5,pan,750);tone(72,24,.6,.4,pan,'sine')}
else if(kind==='grenade'){noise(.4,.42,pan,1000);tone(110,30,.35,.25,pan)}
else if(kind==='melee'){noise(.11,.21,pan,2100,'highpass');tone(760,280,.1,.095,pan)}
else if(kind==='arrow'){noise(.1,.14,pan,3300,'bandpass');tone(1100,430,.08,.035,pan)}
else if(kind==='death'){noise(.23,.15,pan,500);tone(145,65,.24,.16,pan)}
else if(kind==='chop'){noise(.09,.12,pan,650);tone(215,110,.07,.08,pan)}
else if(kind==='mine'){tone(1900,1200,.14,.065,pan);noise(.045,.06,pan,2800,'highpass')}
else if(kind==='harvest')noise(.09,.065,pan,1300);
else if(kind==='heal'){tone(520,850,.28,.09,pan,'sine')}
else if(kind==='ready'||kind==='upgrade'){tone(510,1020,.35,.11,pan,'sine');tone(760,1280,.4,.065,pan,'sine')}
else if(kind==='build'){noise(.12,.12,pan,800);tone(220,100,.12,.08,pan)}
else tone(380,260,.1,.06,pan,'sine')};
})();
