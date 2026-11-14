/* Background music director: calm rotation with gaps, tension during fighting, settings respected. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const CALM=['music/kings-orchard','music/sunlight-orchard','music/cobblestone-celebration','bards-tale'],TENSION='music/unseen-gambit';
for(const k of [...CALM,TENSION]){const f='public/audio/'+k+'.mp3';assert(fs.existsSync(f),'missing '+f);assert(fs.statSync(f).size<4.5*1048576,'too large for mobile '+f)}
let now=0,timers=[],hidden=false;const listeners={},gains=[],A={};
class Param{constructor(){this.value=0}setTargetAtTime(v){this.value=v}setValueAtTime(v){this.value=v}linearRampToValueAtTime(v){this.value=v}}
class Node{constructor(){for(const k of ['gain','pan','threshold','ratio','frequency'])this[k]=new Param();this.playbackRate={value:1}}connect(){}disconnect(){}start(){}}
class Context{constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination=new Node()}resume(){this.state='running';return Promise.resolve()}createGain(){const n=new Node();gains.push(n);return n}createDynamicsCompressor(){return new Node()}createMediaElementSource(el){el.node=new Node();return el.node}createStereoPanner(){return new Node()}createBufferSource(){return new Node()}createBiquadFilter(){return new Node()}createBuffer(){return{getChannelData:()=>new Float32Array(1)}}decodeAudioData(){return Promise.resolve({duration:1})}}
const els=[];class Audio{constructor(){this.currentTime=0;this.paused=true;this.ended=false;this.duration=NaN;els.push(this)}setAttribute(){}play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}}
vm.runInNewContext(fs.readFileSync('public/natural-audio.js','utf8'),{window:{KingdomArt:A,AudioContext:Context},navigator:{},document:{get hidden(){return hidden},addEventListener:(k,f)=>listeners[k]=f},Audio,localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>now},fetch:async()=>({ok:false}),setTimeout:(f,ms)=>{timers.push({f,at:now+(ms||0)});return timers.length},clearTimeout(){},Math});
const flush=()=>new Promise(r=>setImmediate(r));
async function advance(ms){const end=now+ms;for(;;){timers.sort((a,b)=>a.at-b.at);const t=timers[0];if(!t||t.at>end)break;timers.shift();now=t.at;t.f();await flush()}now=end}
const status=()=>A.audioStatus(),playing=()=>els.filter(e=>!e.paused);
function finishTrack(){const e=els.find(x=>!x.paused&&!x.loop);e.duration=100;e.currentTime=99.5}
(async()=>{
 assert.equal(els.length,2,'two crossfade decks');
 listeners.pointerdown();await flush();assert.equal(status().musicMood,'calm');
 await advance(3000);const first=status().musicTrack;assert(CALM.includes(first),'calm piece starts after the first gesture: '+first);assert.equal(playing().length,1,'only one piece audible');
 const order=[first];for(let i=0;i<7;i++){finishTrack();await advance(1000);assert.equal(status().musicTrack,null,'quiet gap after a piece');await advance(24000);assert.equal(status().musicTrack,null,'gap lasts at least 25 s');await advance(47000);const t=status().musicTrack;assert(CALM.includes(t),'next calm piece '+t);assert.notEqual(t,order.at(-1),'no immediate repeat');order.push(t)}
 assert.equal(new Set(order).size,CALM.length,'rotation covers every calm piece: '+order.join(','));
 for(let i=0;i<3;i++){A.sound('melee',0,1,true);now+=500}await advance(1000);assert.equal(status().musicMood,'calm','preview sounds never start tension');
 A.sound('melee');now+=1000;A.sound('melee');await advance(1000);assert.equal(status().musicMood,'calm','two isolated hits are not a battle');
 A.sound('underAttack');await advance(1000);assert.equal(status().musicMood,'tension');assert.equal(status().musicTrack,TENSION);const tense=els.find(e=>!e.paused&&e.loop);assert(tense,'tension piece loops');
 for(let i=0;i<10;i++){A.sound('melee');await advance(5000)}assert.equal(status().musicMood,'tension','continued fighting holds tension');
 await advance(20000);assert.equal(status().musicMood,'tension','no flip-flop right after the last hit');await advance(7000);assert.equal(status().musicMood,'calm');assert.equal(status().musicTrack,null,'fade to silence after the battle');
 await advance(16000);assert(CALM.includes(status().musicTrack),'calm returns after the battle');
 for(let i=0;i<3;i++){A.sound('melee');now+=1000}await advance(1000);assert.equal(status().musicMood,'tension','three hits in quick succession are a battle');
 A.setAudio({musicEnabled:false});await advance(2000);assert.equal(playing().length,0,'music off pauses every deck');A.setAudio({musicEnabled:true});await advance(2000);assert.equal(playing().length,1,'music on resumes');
 hidden=true;listeners.visibilitychange();await advance(2000);assert.equal(playing().length,0,'background tab pauses music');hidden=false;listeners.visibilitychange();await advance(2000);assert.equal(playing().length,1,'foreground resumes music');
 console.log('PASS music director: 2 decks, calm rotation over '+CALM.length+' pieces without repeats, 25-70 s gaps, preview-safe tension trigger, sustained battle, quiet return to calm, music toggle and backgrounding');
})().catch(e=>{console.error(e);process.exit(1)});
