# 《边境王国》音效与音乐审核 v1

审核对象：main（de89f8c）中的 `public/audio/`（62 个文件）、`public/natural-audio.js`（事件→声音映射）、`public/audio/CREDITS.md`、`sources.json`。

审核方法：
- 逐条核对游戏发出的声音事件，以及每个事件实际播放的文件；
- 量了文件时长，核对了素材的原始名称；
- 审核人（Claude）没有逐个试听，涉及“听感”的判断标注为“需试听确认”。

## 一、总体结论

1. **素材都是真实录音**，没有合成音，授权全部是 CC0，可商用、可上架。这一点是好的。
2. **问题在于“借用”**：很多动作没有专门的声音，借用了不相干的通用声音。用户觉得音效不对，主要原因在这里：
   - 挖矿播放的 `stone.ogg`，其实是 Kenney 的 `impactSoft_heavy`，一声闷软的“噗”，不是石头，也没有金属镐声；
   - 射箭播放的 `swing.wav` 是挥剑的风声，没有拉弓、弓弦和箭矢命中；
   - 城墙和建筑被打播放的是木板声加铁盘声，石墙没有石头碎裂声；
   - 种田收割播放的是布料摩擦声；
   - 推进时代、研究完成、胜利共用一个 1.4 秒的通用提示音 `complete.ogg`，没有号角或乐队。
3. **每个动作只有 1 个文件，没有变体**。砍树每 1.3 秒重复同一个 0.24 秒的声音，听久了很机械。帝国时代每种动作通常有 3 到 6 个变体，随机轮换。
4. **语音风格不对（需试听确认）**：`ready / go / hold / attack / complete` 来自 Kenney Voiceover Pack，是现代英语播报腔，和 18 世纪的设定不搭。
5. **背景音乐只有一首**：`bards-tale.mp3`，2 分 38 秒，单曲循环，战斗时只把音量压低，不切换曲子。这首曲子是否用的是真实乐器、混音质量如何，需试听确认。
6. **代码里还留着一套合成音** `public/audio.js`（振荡器加白噪声）。现在正常情况下被 `natural-audio.js` 覆盖，不会响。新素材接入后应该删掉它，免得加载失败时播出电子音。

## 二、逐项清单（优先级：P0 最影响体验）

| 事件 | 现在播放 | 问题 | 要补的素材 | 优先级 |
|---|---|---|---|---|
| 砍树 `chop` | chop.ogg 0.24s，1 个 | 只有一个声音，反复播放很单调 | 斧子砍树干 ×5 变体；树倒下 ×2 | P0 |
| 挖金/挖石 `mine` | 闷软的“噗”声加一点金属声 | 没有镐敲石头的声音 | 铁镐敲岩石 ×5；铁镐敲矿石（更亮的金属声）×4；碎石滚落 ×2 | P0 |
| 推进时代 `upgrade`（age） | complete.ogg 1.4s | 没有仪式感 | 开始推进 ×1；推进中低鼓点循环 ×1；完成的号角和鼓声大乐句 ×3（每个时代一个，越往后越隆重） | P0 |
| 射箭 `arrow`，含箭塔 | 挥剑风声 | 没有弓弦，没有命中 | 拉弓放箭（弓弦）×4；箭飞过 ×3；箭射中木头、盾、肉体、石头 各 ×3 | P0 |
| 建筑和城墙受击 `hit-structure` / `buildingHit` | 木板声加铁盘声 | 石墙、木墙没有区分 | 石墙受击 ×4；木建筑受击 ×4；炮弹砸石墙 ×3 | P0 |
| 建筑倒塌 `collapse` | 同上，很轻 | 没有分量 | 木建筑倒塌 ×2；石建筑或城墙倒塌 ×2；倒塌后的瓦砾和尘土尾音 ×2 | P0 |
| 火炮 `cannon` | 步枪声加铁盘声 | 不是炮声 | 18 世纪前装炮开炮 ×3；远处炮声 ×2；炮弹落地 ×3 | P1 |
| 火枪 `musket` | shot.mp3（现代步枪录音） | 年代不对 | 燧发枪：击锤、火药池、枪响 ×4；齐射 ×2 | P1 |
| 盖房子 `build` / `hammer` | 木板敲击 | 尚可，变体少 | 木槌钉木 ×4；锯木 ×2；凿石 ×3 | P1 |
| 种田收割 `harvest` | 布料摩擦 | 不对 | 镰刀割麦 ×4；捆麦草 ×2 | P1 |
| 采浆果、宰牲畜 `butcher` | 砍树声 | 不对 | 采摘果丛 ×3；宰牲畜（克制、不血腥）×2 | P2 |
| 资源送回 `delivered` | 无 | 缺 | 木头卸下 ×2；石块落地 ×2；金币落袋 ×2；粮袋 ×2 | P1 |
| 研究完成 | complete.ogg | 和时代升级共用 | 羽毛笔、书页加短铃 ×2 | P2 |
| 单位训练完成 | latch | 太弱 | 门闩加一句语音（见下） | P2 |
| 单位语音 | Kenney 现代播报腔 | 年代不对 | 村民、士兵、骑兵、炮兵的应答语音，18 世纪口音，男女各一套，每种 4 到 6 句 | P1 |
| 受到攻击警报 | battle-alert.wav | 需试听确认 | 警钟（教堂钟急敲）×2；军鼓急报 ×1 | P1 |
| 骑兵 | 马蹄 hooves.mp3 | 缺嘶鸣 | 马嘶 ×3；骑兵冲锋马蹄（多匹）×2 | P2 |
| 船只 | swim、creak | 缺帆和舷炮 | 帆布受风 ×2；舷侧齐射 ×2；船体中弹 ×2 | P2 |
| 着火、建筑受损持续声 | 无 | 缺 | 木头燃烧循环 ×1 | P2 |
| 胜利/失败 | complete.ogg | 没有仪式感 | 胜利乐段 ×1；失败乐段 ×1（实录乐器，见第四节） | P1 |
| 界面点击 | latch、go | 尚可 | 木质按钮、纸张翻页、羊皮纸展开 ×各 2 | P2 |

**时代升级还要配画面**（不属于音频，单独做）：
- 推进中显示明显的进度条（城镇中心上方和顶部状态栏都有）；
- 完成时全屏横幅写“进入 II · 殖民时代”，城镇中心外观随时代变化。

这些要和音效同步：推进开始的鼓点、推进中的低鼓循环、完成时的号角，正好对应进度条的开始、进行和完成。

## 三、音效生成提示词

**统一规格（每条提示词后面都附上）：**

> EN: Realistic Foley recording, 18th-century setting, no music, no voices unless stated, no reverb tail longer than 0.5 s, mono, 48 kHz, peak −1 dBFS, clean start, natural 20 ms fade-out, no background ambience, no electronic or synthesized elements. Generate N distinct variations.
>
> 中文：真实拟音录音，18 世纪背景；不要音乐；除非注明，不要人声；混响尾音不超过 0.5 秒；单声道，48 kHz，峰值 −1 dBFS；起音干净，结尾 20 毫秒自然淡出；不要环境底噪；不要任何电子或合成音色。生成 N 个不同的变体。

**生成工具：**
- Codex 本身通常不能生成音频。可以让 Codex 调用 ElevenLabs Sound Effects、Stable Audio 等支持音效的生成服务，或者你直接在这些网站上生成。
- 也可以用 CC0 或免版税的实录音效库，比如 Freesound 上标为 CC0 的素材、Sonniss 的 GDC 免版税音效包。
- **商用授权**：AI 生成服务一般要付费套餐才允许商用，用之前确认条款。

| 文件名 | EN 提示词 | 中文提示词 | 时长 |
|---|---|---|---|
| chop_01–05 | A steel felling axe striking the trunk of a living oak tree, solid woody thunk with a slight bark crack, outdoors | 钢制伐木斧砍在活橡树树干上，结实的木质闷响，带一点树皮开裂声，户外 | 0.4–0.6s |
| tree_fall_01–02 | A medium tree cracking at the base, creaking, then falling and crashing through branches onto grass | 一棵中等大小的树从根部断裂、吱嘎作响，然后穿过枝叶倒在草地上 | 2.5–3.5s |
| mine_stone_01–05 | An iron pickaxe striking hard granite rock, sharp metallic ring of the pick plus stone crack and small chips falling | 铁镐敲击坚硬的花岗岩，镐头清脆的金属声，加上石头开裂和碎屑掉落 | 0.4–0.7s |
| mine_gold_01–04 | An iron pickaxe striking quartz rock with gold ore, brighter metallic clink, small ore pieces tumbling | 铁镐敲击含金矿的石英岩，金属声更亮，小矿块滚落 | 0.4–0.7s |
| rubble_01–02 | Small loose rocks and gravel tumbling down a short slope | 一小堆碎石和砾石从短坡上滚落 | 0.8–1.2s |
| bow_release_01–04 | A wooden longbow drawn and released, string twang and wooden limb snap, close perspective | 木制长弓拉满后放箭，弓弦嗡响加弓臂回弹声，近距离 | 0.3–0.5s |
| arrow_flyby_01–03 | A single arrow whistling past, short Doppler whoosh | 一支箭从耳边呼啸而过，短促的多普勒风声 | 0.3–0.5s |
| arrow_hit_wood/shield/stone/flesh ×3 each | An arrow hitting [a wooden plank / a wooden shield / a stone wall / a padded soldier's coat], short impact, no gore | 箭射中[木板 / 木盾 / 石墙 / 棉甲军服]，短促命中声，不血腥 | 0.2–0.4s |
| wall_hit_stone_01–04 | A heavy blow striking a thick stone castle wall, deep thud, stone cracking, dust and small debris falling | 重击打在厚石城墙上，低沉的撞击声，石头开裂，尘土和小碎块掉落 | 0.6–1.0s |
| building_hit_wood_01–04 | A heavy blow striking a timber-framed building, wood splintering, beams creaking | 重击打在木结构房屋上，木头碎裂，梁木吱嘎 | 0.6–1.0s |
| cannonball_hit_wall_01–03 | An 18th-century iron cannonball smashing into a stone fortification wall, explosive stone shatter, heavy debris | 18 世纪铁炮弹砸进石砌要塞墙，石块爆裂飞散，大块碎石落下 | 1.2–1.8s |
| collapse_wood_01–02 | A two-storey wooden house collapsing, beams snapping, roof tiles and timber crashing down, dust settling | 两层木房倒塌，梁木折断，屋瓦和木料砸落，尘土落定 | 3–4s |
| collapse_stone_01–02 | A stone tower or wall section collapsing, massive stone blocks falling, rumble and settling rubble | 石塔或一段城墙倒塌，巨石落下，轰隆声后碎石落定 | 3–4.5s |
| cannon_fire_01–03 | An 18th-century muzzle-loading field cannon firing, deep black-powder boom, short outdoor echo | 18 世纪前装野战炮开炮，低沉的黑火药爆响，户外短回声 | 1.5–2.5s |
| cannon_distant_01–02 | The same cannon heard from 1 km away, muffled low boom | 同样的炮声从 1 公里外传来，闷沉的低响 | 1.5–2.5s |
| musket_01–04 | An 18th-century flintlock musket firing: flint strike, pan flash, then black-powder shot | 18 世纪燧发火枪射击：燧石击打、药池闪燃、黑火药枪响 | 0.8–1.2s |
| musket_volley_01–02 | A line of 10 to 15 flintlock muskets firing an almost simultaneous volley | 10 到 15 支燧发枪几乎同时齐射 | 1.5–2.5s |
| hammer_wood_01–04 | A wooden mallet driving a wooden peg into a timber frame | 木槌把木钉敲进木构架 | 0.3–0.5s |
| saw_01–02 | A hand saw cutting a wooden beam, three or four strokes | 手锯锯木梁，三到四下 | 1.5–2.0s |
| chisel_stone_01–03 | A mason's iron chisel and hammer shaping a stone block | 石匠用铁凿和锤子修整石块 | 0.4–0.6s |
| scythe_01–04 | A scythe swinging through ripe wheat, swish and stalks cut | 镰刀扫过成熟的麦子，嗖的一声，麦秆被割断 | 0.5–0.8s |
| deliver_wood/stone/gold/food ×2 each | [A small armful of logs dropped onto a wooden pile / Several stones dropped onto a stone pile / A small pouch of gold coins dropped into a chest / A grain sack set down on wooden boards] | [一小捆木柴丢到木堆上 / 几块石头扔到石堆上 / 一小袋金币丢进箱子 / 一袋粮食放到木板上] | 0.5–0.9s |
| alarm_bell_01–02 | A church bronze bell struck rapidly as an alarm, outdoors, medium distance | 教堂铜钟急促敲响报警，户外，中等距离 | 2.5–3.5s |
| alarm_drum_01 | A military snare drum beating an urgent 18th-century alarm roll | 军鼓敲出急促的 18 世纪警报鼓点 | 2–3s |
| horse_neigh_01–03 | A war horse neighing and snorting, outdoors | 战马嘶鸣、打响鼻，户外 | 1–1.5s |
| cavalry_charge_01–02 | Eight to twelve horses galloping past on grass, rising then falling | 八到十二匹马在草地上奔驰而过，声音由远及近再远去 | 3–4s |
| sail_01–02 | A canvas sail filling with wind, ropes creaking | 帆布鼓满了风，缆绳吱嘎 | 1.5–2.5s |
| broadside_01–02 | A wooden warship firing a broadside of 6 to 8 cannons in rapid sequence | 木制战舰一侧 6 到 8 门炮快速依次开火 | 3–4s |
| fire_loop_01 | A wooden building burning, crackling flames, seamless loop | 木建筑燃烧，火焰噼啪作响，可无缝循环 | 6–8s |
| research_01–02 | A quill writing on parchment followed by a small brass hand bell | 羽毛笔在羊皮纸上书写，接一声小铜手铃 | 1.0–1.5s |
| ui_wood_01–02 / ui_page_01–02 | A small wooden toggle clicked / A parchment page turned | 小木拨杆的咔哒声 / 翻动一页羊皮纸 | 0.1–0.4s |

**语音**（P1；英文和中文两套，可以只先做英文）：

> EN: Voice lines for an 18th-century RTS. Natural acted delivery, slightly weathered, outdoors close-mic, no radio or modern announcer tone, no music. Male and female villager versions: "Yes?", "At your service.", "To work!", "Right away.", "Aye." Soldier versions: "Orders?", "Ready, sir.", "Forward!", "Hold the line!", "Fix bayonets!" Each line as a separate file, 0.5–1.2 s.
>
> 中文：18 世纪 RTS 单位应答语音。像真人演出那样自然，略带风霜感；户外近距离收音；不要无线电或现代播报腔；不要音乐。村民男女各一套：“在。”“听候吩咐。”“干活去！”“马上办。”“好嘞。”士兵：“请下令。”“准备就绪。”“前进！”“守住阵线！”“上刺刀！”每句单独一个文件，0.5 到 1.2 秒。

## 四、背景音乐：丰富化方案（只用真实乐器）

**现状：** 只有一首 2 分 38 秒的曲子循环播放，开战时把音量压低。

**目标：** 像帝国时代那样，按局势切换曲目，还要有时代升级和胜负的专用乐段。

**乐器限定**（18 世纪巴洛克到早期古典，全部原声）：
- 弦乐四重奏或小型弦乐团；
- 大键琴（羽管键琴）、鲁特琴或古典吉他；
- 竖笛、长笛、横笛（法夫笛）；
- 双簧管、巴松管；
- 自然小号、圆号；
- 定音鼓、军用小鼓；
- 手摇风琴、竖琴。

**和声的变化来源：**
- 多利亚、混合利底亚等调式；
- 巴洛克的 ii–V–I 进行和五度循环；
- 西班牙用安达卢西亚终止（i–VII–VI–V）；
- 小调和关系大调之间转调；
- 低音持续音（风笛式）；
- 小步舞曲和吉格的节奏。

**曲目清单：**

| 文件 | 用途 | 时长 | 要点 |
|---|---|---|---|
| peace_a / peace_b / peace_c | 和平发展期，随机轮换 | 各 2.5–3.5 分钟，可循环 | 三首调式和主奏乐器各不相同，避免单曲循环疲劳 |
| tension_a | 敌人出现、被骚扰 | 1.5–2 分钟，可循环 | 低弦乐持续音，定音鼓弱奏 |
| battle_a / battle_b | 大规模交战 | 各 2 分钟，可循环 | 军鼓、小号、全弦乐，快板 |
| age_up_2 / age_up_3 | 进入 II、III 时代的乐段 | 6–10 秒 | 号角加定音鼓滚奏，III 比 II 更隆重 |
| age_progress_loop | 时代推进期间叠加的鼓点 | 8 秒，可循环 | 军鼓弱奏，配合进度条 |
| victory / defeat | 胜利 / 失败 | 20–30 秒 | 大调凯旋进行曲 / 小调挽歌 |
| nation_motif ×10 | 每个国家开局的 8 秒主题 | 8 秒 | 英国：法夫笛加鼓；法国：大键琴小步舞曲；西班牙：吉他，安达卢西亚终止；荷兰：竖笛加鲁特琴；普鲁士：进行曲小号；俄国：低音合唱式弦乐；奥斯曼：祖尔纳双簧管加大鼓（Mehter）；中国：古筝、笛子、编钟；日本：尺八、太鼓、三味线；其余国家按同样思路 |

**音乐提示词模板**（Suno、Udio、Stable Audio、ElevenLabs Music 等。务必写上 “no synthesizers”，并在生成后试听把关）：

> EN (peace_a): Instrumental, 18th-century Baroque pastoral for a strategy game, live acoustic chamber ensemble only: string quartet, harpsichord continuo, baroque recorder and lute. D Dorian moving to F major, gentle 3/4 minuet feel, 92 BPM. Warm natural room reverb, recorded in a wooden hall. No synthesizers, no electronic pads, no drums kit, no vocals. Seamless loop, 3 minutes, ends on the opening chord.
>
> 中文（peace_a）：纯器乐，18 世纪巴洛克田园风，用于策略游戏。只用现场原声室内乐：弦乐四重奏、大键琴通奏低音、巴洛克竖笛、鲁特琴。从 D 多利亚调式转到 F 大调，轻柔的 3/4 小步舞曲律动，92 BPM。温暖自然的厅堂混响，像在木质大厅里录制。不要合成器、电子铺底音色、架子鼓和人声。可无缝循环，3 分钟，结尾落回开头的和弦。

> EN (battle_a): Instrumental 18th-century battle music, live orchestra only: full strings, natural trumpets, French horns, timpani and military snare drums, fife countermelody. C minor, driving 132 BPM, Baroque sequences and diminished-seventh tension, sudden dynamic swells. No synthesizers, no electronic percussion, no choir pads, no vocals. Seamless 2-minute loop.
>
> 中文（battle_a）：纯器乐 18 世纪战斗音乐，只用现场管弦乐：全弦乐、自然小号、圆号、定音鼓、军用小鼓，加法夫笛的对位旋律。C 小调，推进感强，132 BPM，用巴洛克模进和减七和弦制造紧张感，力度突然涌起。不要合成器、电子打击乐、合唱铺底音色和人声。2 分钟，可无缝循环。

> EN (age_up_3): 8-second orchestral fanfare for reaching a new era: natural trumpets and horns in D major, timpani roll into a final full-orchestra chord, live recording, no synthesizers.
>
> 中文（age_up_3）：8 秒的管弦号角乐段，用于进入新时代：D 大调的自然小号和圆号，定音鼓滚奏后，以全乐团的最后一个和弦收尾。现场录音质感，不要合成器。

其余曲目照这个结构换：调式、速度、主奏乐器、时长。

**一个提醒：** AI 音乐模型输出的是模拟真实乐器的合成音频，不是乐手实录。要百分之百真实乐器，有两个办法：
- 用古典乐公版录音（注意：录音本身也必须是公版或 CC0）；
- 委托乐手录制。

AI 生成的成品也要逐首试听，有电子感的直接淘汰。

## 五、交付与验收标准（素材回来后由我接入）

- **格式：**
  - 音效：OGG（Vorbis q5），同时提供 M4A/AAC，兼容 iOS Safari；
  - 音乐：M4A（AAC 160 kbps）加 OGG。
- **响度：**
  - 音效峰值 −1 dBFS，同类变体之间响度差 ≤ 2 dB；
  - 音乐整曲约 −18 LUFS，可循环曲目首尾无爆音。
- **数量：** 按第三、四节的变体数交付。播放时随机轮换，并做 ±5% 的音高、音量微变。
- **包体：** 音效总量 ≤ 3 MB，音乐总量 ≤ 15 MB。音乐按需加载，不进首屏预缓存。
- **授权：** 每个文件在 `public/audio/CREDITS.md` 和 `sources.json` 登记生成工具或来源、日期，以及允许商用和上架的授权条款。
- **接入时的代码改动（由我做）：**
  - `natural-audio.js` 把 `arrow` 拆成弓弦、飞行、命中三类，`hit-structure` 按石、木区分，新增 `ageUp`、`ageProgress`、`delivered`、`treeFall`、`fire` 等事件；
  - 音乐改成按局势切换的状态机（和平 → 紧张 → 战斗 → 回落），带交叉淡入淡出；
  - 删除合成音备用文件 `public/audio.js`；
  - 新增检查：每个事件至少映射到一个文件；变体数达标；总大小不超标。
