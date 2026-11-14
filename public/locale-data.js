/* Presentation dictionary. Simulation IDs and saved games remain language independent. */
((root)=>{const pairs=`
精密机械工坊：蒸汽装甲车（每国最多 3 辆）、长管迫击炮；电报与军械局：连发步枪卫队、战地军医。轧制钢板、精制发射药、野战电报提供有限强化。车辆昂贵且缓慢，迫击炮有最低射程|Precision Workshop: steam crawlers (3 per nation) and long-barrel mortars. Signal Bureau: repeating rifle guards and field medics. Research rolled steel, refined propellant and field telegraphy. Crawlers are costly and slow; mortars cannot fire at close range
建造市场并训练商队。选择商队后设置路线；未选商队时安排本国全部商队。新商队会自动寻找路线，走完往返后结算黄金，外国市场获得 50% 分成|Build a market and train caravans. Select caravans to assign routes, or assign all your caravans when none are selected. New caravans find routes automatically. Gold is paid after a round trip; foreign markets receive a 50% share
每张地图仅一座偏远要塞，由 KC 熔岩龙或 KC 深渊守卫随机守护。必须研发到 V 时代，再集结军队与英雄。喷火有地面预警，可以撤离红圈|Each map has one remote fortress, randomly guarded by the KC Lava Dragon or Abyssal Demon. Reach Age V and assemble an army with a hero. Fire attacks are marked on the ground: move out of the red circle
后期解锁依然需要实际支付食物、木材、黄金与石料。英雄占 6 人口，每国一名，阵亡重招等待 180 秒；技能消耗黄金|Late-game unlocks cost real resources. Each nation may recruit one hero, costing 6 population. A fallen hero takes 180 seconds before recruitment is available again. National abilities cost gold
轻缓中世纪氛围：持续弦音、轻笛与缓慢和声，没有背景鼓点或连续拨弦。金属碰撞、木锤施工、枪炮和落成钟声独立混音|Gentle medieval ambience: sustained strings, light flute and slow harmony, without drums or busy plucking. Weapons, construction, gunfire and completion bells have separate sound effects
各难度均无保护时间。偏远要塞每图仅一座，随机一名 KC 守卫；海岛目标需要运输登陆，内陆目标位于地图边缘高地|There is no protection timer on any difficulty. Each map has one remote KC fortress and one random guardian. Island objectives require transports; inland objectives stand on high ground near the map edge
同队不会互相攻击，共享胜负。敌国可花费 120 黄金签订停战贸易，60 秒后可解除；停战不改变最终胜利目标|Teammates cannot attack each other and share victory. A trade truce with an enemy costs 120 gold and lasts at least 60 seconds. A truce does not change the victory objective
默认关闭，便于熟悉地图。1 对 1 使用小地图；多人使用大地图。每方初始资源数量相同，分布会变化|Off by default while learning. Duels use small maps; larger matches use large maps. Starting resource budgets are equal, with varied placement
架空历史混合战役：美国等后期国家可与早期国家同场竞技。国家不等于队伍，旗帜下方色条表示队伍玩家|An alternate-history campaign: later nations may fight alongside earlier ones. Nation and team are separate choices; colors identify players
守卫有追击边界与脱战恢复；要塞在守卫存活时不可破坏。奖励按有效伤害贡献归属，不由最后一击决定|Guardians have a pursuit boundary and regenerate outside combat. The fortress is invulnerable while its guardian lives. Rewards go to the nation contributing the most effective damage, not the final hit
降低难度会调整电脑的发展与战力，不提供免战保护。保留你的建筑、资源与研究|Lowering difficulty changes AI growth and strength without granting immunity. Your buildings, resources and research are preserved
这是可安装的网页 App（PWA），不是 App Store 原生安装包|This is an installable web app (PWA), rather than an App Store package
本国英雄获得霜环与守护结界；消耗魔力，有独立冷却，最多影响 5 名陆军|Your hero gains Frost Ring and Protective Ward. Spells cost mana, have a separate cooldown and affect at most 5 land units
你固定在第 1 队。同队共享胜负；不同队默认敌对。可重复选择国家|You are on Team 1. Teammates share victory; other teams are enemies by default. Nations may be repeated
高护甲、低机动，占 6 人口；被长程炮兵克制，每国最多 3 辆|Heavy armor and low mobility; 6 population. Vulnerable to long-range artillery. Maximum 3 per nation
在本国市场与友好市场或中立商站间往返，完成回程后双方获得黄金|Travels between your market and a friendly market or neutral trading post. Both sides earn gold after a round trip
第五时代范围火炮，占 5 人口、最低射程 100，必须配护卫|Age V area artillery; 5 population, minimum range 100. Requires an escort
可建造，施工效率 +50%，自动修复附近脱战建筑；不采集|Builds 50% faster and repairs nearby buildings outside combat. Cannot gather resources
皇家胸甲骑兵强悍但占 2 人口、成本高，怕长枪与火枪集火|Royal cuirassiers are powerful but costly and use 2 population. Vulnerable to pikes and concentrated gunfire
已停战，可互通商队；仍需终止协定后击败其联盟才能获胜|Trade truce active. Caravans may trade, but you must end the pact and defeat that alliance to win
第五时代招募本国英雄；全军最多一名，阵亡后等待三分钟|Recruit your national hero in Age V. One per nation; wait three minutes after a hero falls
顶部 ♪ 按钮控制音效；背景音乐可在这里单独关闭|The top ♪ button controls sound effects. Background music can be disabled separately here
长弓卫士射程远，但血量低；用护航舰队保护海上经济|Longbow guards have long range but low health. Protect your maritime economy with an escort fleet
诸葛连弩射速高，但穿甲弱；适合经济扩张和成群作战|Chu Ko Nu fire rapidly but struggle against armor. Best for expansion and massed formations
红色标记为敌军。选择己方部队后点击敌人指定攻击|Red markers indicate enemies. Select your troops, then select an enemy to attack
超远程攻坚，最低射程 155；血量低，必须护卫|Very long-range siege, minimum range 155. Low health; needs protection
这里不能建造，请选择远离建筑、资源与河流的空地|Cannot build here. Choose clear land away from buildings, resources and rivers
所有建筑生命 +15%，修复现有建筑比例不变|All buildings gain 15% health; existing buildings retain their health percentage
保护期内双方暂不交战，可安心采集、建设与贸易|Combat is temporarily restricted; gather, build and trade
分享 → 添加到主屏幕，再从图标启动全屏游戏|Share → Add to Home Screen, then launch the icon for fullscreen play
六图远征 · 无保护期 · 边境 KC 要塞|Six maps · No protection timer · Remote KC fortress
射击军：成本偏食物、较耐打，射程与机动较低|Streltsy: food-heavy cost and durable health, but shorter range and slower movement
普鲁士掷弹卫队：纪律火枪兵，伤害高但成本高|Prussian Guards: disciplined musketeers with high damage and high cost
重装反骑兵近卫，占 2 人口，怕炮火与远程|Armored anti-cavalry guards; 2 population. Vulnerable to artillery and ranged fire
在城镇中心晋升时代，市场与铁匠铺可研究科技|Advance ages at the Town Center. Research technology at the Market and Blacksmith
本国建筑与陆军视野 +15%；不会揭开全图|Your buildings and land units gain 15% sight. Does not reveal the whole map
声音已启动，可在声音设置分别调节音乐和音效|Audio started. Adjust music and sound effects separately in audio settings
请再次点击“恢复声音”，并检查设备媒体音量|Tap Restore Audio again and check your device media volume
拿骚神射手：高射程单发步枪，血少、怕骑兵|Nassau sharpshooters: long-range rifles, low health and vulnerable to cavalry
法国专属：重装冲锋，占 2 人口，成本高|French unique unit: armored charge, 2 population and high cost
所选单位无法执行此命令，请更换单位或目标|These units cannot perform that order. Choose other units or another target
点空地脱战移动；R / 撤退按钮返回主城|Select empty ground to disengage. Press R or Retreat to return home
为附近脱战陆军提供持续医疗，自身不能攻击|Continuously heals nearby allied land units outside combat. Cannot attack
点选单位，再点目标指挥 · 拖动地图探索|Select units, then a target to command · Drag to explore
离线资源已就绪；首次联网加载后可离线游玩|Offline assets ready. Play offline after the initial online load
电脑不主动组织军队，适合自由建设与试验|AI does not actively assemble armies. Suitable for free building and experimentation
武士：高近战攻击，怕远程集火与骑兵包夹|Samurai: strong melee attack; vulnerable to focused ranged fire and cavalry flanks
大陆军步枪兵：射程与机动较好，近战脆弱|Continental riflemen: good range and mobility, weak in melee
骑马火枪兵，可机动射击，怕枪阵与反骑兵|Mounted musketeers with mobile firepower, vulnerable to pikes and anti-cavalry
仅攻击建筑，最小射程 120，需要护卫|Attacks buildings only; minimum range 120. Needs an escort
已停止追击：陆军返回主城，舰队返回港口|Pursuit stopped: land units return home and ships return to port
海岸远征将开启新战局，之前的存档仍保留|This campaign starts a new battle. Earlier saves remain stored
此浏览器请通过“添加到主屏幕”全屏启动|Use Add to Home Screen to launch fullscreen in this browser
离线资源正在缓存，请保持联网至提示就绪|Caching offline assets. Stay online until they are ready
当前浏览器未启用离线缓存；仍可联网游玩|Offline caching is unavailable in this browser. Online play still works
禁卫火枪兵：血厚、近中程火力，移动慢|Janissaries: durable, short-to-medium-range firepower and slow movement
大方阵枪兵：擅长反骑兵，怕远程与炮火|Tercio pikemen: strong against cavalry, vulnerable to ranged fire and artillery
正在缓存离线资源，首次加载请保持联网|Caching offline assets. Stay online for the first load
当前浏览器不支持离线缓存，请联网游玩|This browser does not support offline caching. Please play online
沿海建造，训练渔船、轻型舰与运输船|Build on the coast to train fishing boats, light warships and transports
英国专属：长射程、低生命，克制步兵|British unique unit: long range, low health and strong against infantry
装载 6 人口陆军或村民，靠岸卸载|Carries up to 6 population of land units or villagers. Unload near shore
点选村民建设，选择城镇中心晋升时代|Select a villager to build, or the Town Center to advance ages
已预览位置，点击“确认建造”后施工|Placement preview ready. Select Confirm Build to begin construction
已选择舰队：点敌舰攻击，点水面航行|Fleet selected: select enemy ships to attack, or water to sail
快速火枪，双人口；怕骑兵和范围炮击|Rapid rifle fire; 2 population. Vulnerable to cavalry and area artillery
火枪类伤害 +8%，不提高炮兵伤害|Musketeer damage +8%; artillery damage is unchanged
每国最多 3 辆蒸汽装甲车，含队列|Maximum 3 steam crawlers per nation, including queued units
人口已满，建造房屋可增加 8 人口|Population full. Build houses to increase capacity
离线资源已就绪；当前战局保存在本机|Offline assets ready. This battle is saved on this device
训练近卫戟兵、龙骑兵与军械工程师|Trains elite halberdiers, dragoons and engineers
高速绕后与护送，正面抗击能力较弱|Fast flanking and escort unit, weak in direct combat
快速护航与反运输船，不能硬抗重舰|Fast escort and transport hunter. Avoid direct fights with heavy warships
每秒产生 1 黄金，研究采集效率|Produces 1 gold per second and researches gathering efficiency
至少需要一名不同队伍的电脑对手|At least one AI opponent on another team is required
至少需要一个不同队伍的电脑对手|At least one AI opponent on another team is required
签订停战贸易需要 120 黄金|A trade truce requires 120 gold
电脑慢发展、低伤害、小规模进攻|Slow AI growth, reduced damage and small attacks
研究弹道、后勤、野战医疗与筑城|Researches ballistics, logistics, field medicine and fortifications
石料矿场：矿石提升架与矿车靠近采掘点布置；派村民前往可见矿脉开采，持续获得石料|Stone mining depot with an ore hoist and carts; send villagers to visible veins for a steady supply
法国王室骑兵学府：训练高防御皇家胸甲骑兵；学院庭院以马术与队列操练闻名|French royal cavalry school: trains heavily armored Royal Cuirassiers in its riding yard
射程远，擅长对付火枪兵，血量低|Long range and strong against musketeers, but low health
中国专属：高射速，怕护甲与骑兵|Chinese unique unit: rapid fire, vulnerable to armor and cavalry
专门轰击岸上建筑，需要舰队护航|Bombards shore buildings. Requires a naval escort
需要己方营地，或先派村民到附近|Build near your settlement or send a villager to the site
让陆军或村民靠近运输船后再装载|Move land units or villagers near the transport before loading
村民施工中。建造完成后即可使用|Villagers are building. Available when construction is complete
已安装到设备，可从应用图标启动|Installed. Launch from the app icon
森林高地、峭壁、湖泊与宽阔侧翼|Forested highlands, cliffs, lakes and broad flanking routes
需要可通行陆地，避开水域与断崖|Requires traversable land, away from water and cliffs
训练重型榴弹炮，研究爆破弹药|Trains heavy howitzers and researches explosive shells
每国最多一名英雄，含训练队列|One hero per nation, including the training queue
查看十国 · 科技与英雄图鉴|Nations, Technology & Heroes
中国特色建筑，训练诸葛连弩兵|Chinese unique building: trains Chu Ko Nu
低速反骑兵步兵，抗压但怕远程|Slow, durable anti-cavalry infantry, vulnerable to ranged fire
主力炮舰，火力稳健，机动较慢|Main battle warship with reliable firepower and slow movement
需要陆地，港口与浴场请选海岸|Requires land. Place docks and baths near the coast
远程范围轰击，对建筑三倍伤害|Long-range area bombardment; triple damage against buildings
自动治疗附近受伤友军，不攻击|Automatically heals nearby wounded allies. Cannot attack
海上警报：敌方舰队正接近港口|Naval alert: an enemy fleet is approaching your port
点击空地移动，移动会打断交战|Select empty ground to move and disengage from combat
已开始建造，村民正在赶往工地|Construction ordered. Villagers are moving to the site
还没有军队，点击兵营训练士兵|No army yet. Select a barracks to train soldiers
没有村民，请选择城镇中心训练|No villagers. Train them at the Town Center
没有村民，请在城镇中心训练|No villagers. Train them at the Town Center
双人海岸、河流石桥与离岸小岛|Duel coastline, stone bridges and offshore islands
五方大地图，海湾、桥梁与群岛|Large five-player map with bays, bridges and islands
需要附近有海、湖泊或河流水域|Requires nearby sea, lake or river water
贸易协定至少维持 60 秒|Trade pacts last at least 60 seconds
脱战陆军每秒恢复 1 生命|Land units outside combat recover 1 health per second
技能范围内没有可攻击的陆军|No valid enemy land units in ability range
附近没有适合这个技能的部队|No suitable units nearby for this ability
专门防御军舰，不能攻击陆军|Defends against warships only. Cannot attack land units
英国特色建筑，训练长弓卫士|British unique building: trains Longbow Guards
需要在主大陆海岸线附近建造|Must be built near the mainland coastline
重型区域防御，压制成群敌军|Heavy area defense against massed enemies
派遣村民采集资源或建造建筑|Assign villagers to gather resources or construct buildings
村民都在忙，已选择一名村民|All villagers are busy. One villager selected
先探索地图边缘，再定位要塞|Explore the map edge before locating the fortress
不规则内陆、镜湖与林间矿脉|Irregular inland terrain, a mirror lake and woodland deposits
建造护卫舰和攻岸迫击炮舰|Builds frigates and shore-bombarding mortar ships
采集深海鱼群，无战斗能力|Gathers deep-water fish. Cannot fight
派村民耕作，持续提供食物|Assign villagers to farm for a steady food supply
高速冲锋，克制远程与火炮|Fast charge, strong against ranged units and artillery
爆炸范围伤害，擅长拆建筑|Explosive area damage, strong against buildings
选择单位或建筑以查看命令|Select a unit or building
正在撤退 · 不追击敌人|Retreating · No pursuit
正在移动 · 不追击敌人|Moving · No pursuit
施工完成后可使用这座建筑|Available after construction is complete
请在港口或造船厂建造军舰|Build warships at the Dock or Shipyard
切回游戏后触摸屏幕可恢复|Touch the screen after returning to restore audio
独立窗口 · 主屏幕启动|Standalone window · Launch from Home Screen
陆战地图，断崖与狭窄山口|Land warfare, cliffs and narrow mountain passes
内陆双河、湖群与三处渡口|Two inland rivers, lakes and three crossings
附近没有可施法的敌方陆军|No enemy land units nearby for this spell
所选单位无法攻击此目标|Selected units cannot attack this target
经济加速与持续军队压力|Accelerated economy and sustained military pressure
标准经济与战斗属性；更快决策、更大编队与更有针对性的防御|Standard economy and combat stats; faster decisions, larger formations and more focused defense
标准经济与战斗属性；更快决策、更大编队、主动资源扩张与更有针对性的防御|Standard economy and combat stats; faster decisions, larger formations, active resource expansion and more focused defense
电脑按难度逐步推进时代|AI advances through ages according to its difficulty
无保护期，开局即可交战|No protection timer. Combat is possible from the start
请靠近海岸或岛屿后卸载|Move near a coast or island to unload
这座建筑不能训练该兵种|This building cannot train that unit
警报：敌军接近你的营地|Alert: enemies are approaching your settlement
海岸与群岛属于你的王国|The coast and islands belong to your kingdom
正在前往工地 / 施工|Moving to site / Building
请先在军事建筑训练部队|Train troops at a military building first
选择单位或建筑开始指挥|Select units or buildings to begin
作为网页 App 打开|Open as Web App
要塞已破，本国获得奖励|Fortress destroyed. Your nation earned the reward
港口等建筑需要陆地岸边|Coastal buildings must stand on land near water
先派村民或工程师到附近|Send a villager or engineer nearby first
按国家与队伍设置开始|Start with these nations and teams
外交、队伍与商队贸易|Diplomacy, teams and caravan trade
本难度电脑不招募英雄|AI does not recruit heroes on this difficulty
只能训练本国特色兵种|Only your own national unique units can be trained
只能建造本国特色建筑|Only your own national unique building can be built
高伤害火枪，克制骑兵|High-damage musket fire, strong against cavalry
人口不足，请建造房屋|Not enough population capacity. Build houses
请在己方建筑附近建造|Build near your own buildings
远征军赢得了这场战役|Your expedition has won this battle
解锁更高级建筑和兵种|Unlocks more advanced buildings and units
音效已关闭，点击开启|Sound effects off. Select to enable
音效已开启，点击关闭|Sound effects on. Select to mute
以所选国家开启新战役|Start a new campaign with this nation
选择国家 · 新战役|Choose Nation · New Campaign
安装到手机 / 电脑|Install on Phone / Computer
拖动地图，双指可缩放|Drag to pan; pinch to zoom
要塞已被其他国家攻破|Another nation has destroyed the fortress
先探索并照亮施工区域|Explore and reveal the construction site first
请先在市场训练商队|Train caravans at a market first
这个国家已退出战役|This nation has been defeated
协定终止，恢复敌对|Pact ended. Hostilities resumed
目标市场已不可贸易|That market is no longer available for trade
较弱经济与温和攻势|Weaker economy and gentle attacks
正常伤害与渐进进攻|Normal damage and gradually stronger attacks
更快发展与更大编队|Faster development and larger formations
本难度电脑军队上限|AI military population limit for this difficulty
附近没有受伤的陆军|No wounded land units nearby
需要远离建筑与资源|Keep clear of buildings and resources
需要远离建筑和资源|Keep clear of buildings and resources
训练村民，推进时代；驻守民兵用火枪齐射附近敌军|Train villagers and advance ages; garrisoned militia fire musket volleys at nearby enemies
训练村民，推进时代|Train villagers and advance ages
训练弓箭手与火枪兵|Trains archers and musketeers
研究武器与护甲科技|Researches weapons and armor
在城镇中心推进时代|Advance ages at the Town Center
本时代已达最高等级|Maximum level for the current age
在营地附近空地放置|Place on clear ground near your settlement
停止追击，直达目标|Move directly
点击游戏以激活音效|Touch the game to activate audio
已选择附近同类单位|Nearby units of the same type selected
展开或收起命令面板|Expand or collapse the command panel
收起或展开底部命令|Collapse or expand bottom commands
英雄魔力不足（需要|Hero mana too low (requires
需要本国国家学说|Requires your national doctrine
英雄目前无法行动|Hero cannot act right now
国家图集加载失败|National artwork failed to load
需要避开岩石丘陵|Keep clear of rocky hills
训练步兵与掷弹兵|Trains infantry and grenadiers
自动射击附近敌军|Automatically fires at nearby enemies
训练医师治疗友军|Trains medics to heal allies
采集、耕作与施工|Gather / farm / build
不能在河流上建造|Cannot build on a river
你的王国暂时陷落|Your kingdom has fallen
左右滑动查看更多|Swipe for more commands
正在准备远征地图|Preparing expedition map
正在载入战场美术|Loading battlefield artwork
自动选择其他国家|Choose another nation automatically
开启新的海岸远征|Begin a new coastal expedition
按新设置开始战役|Start with the new settings
可安装为独立窗口|Installable as a standalone app
拖出选框选择部队|Drag a box to select troops
正在检查离线资源|Checking offline assets
美术素材加载失败|Artwork failed to load
远征图集加载失败|Expedition artwork failed to load
前往已探索的要塞|Go to Discovered Fortress
没有可领取的奖励|No reward available to claim
先建造本国市场|Build your own market first
电脑工程师上限|AI engineer limit
不能建造此建筑|This building cannot be built
研究建筑不匹配|Research requires a different building
研究已在进行中|Research already in progress
已加入研究队列|Added to research queue
已加入训练队列|Added to training queue
已安排渔船捕鱼|Fishing boat assigned to fish
资源不足：需要|Not enough resources: requires
先选择一名村民|Select a villager first
恢复声音与音效|Restore Audio
恢复声音并试听|Restore Audio & Test
把王国装进手机|Install Your Kingdom
中立挑战与宝藏|Neutral challenge and treasure
已选择其他奖励|Another reward was chosen
只强化本国英雄|Only strengthens your national hero
需要糖豆秘法书|Requires the Tangdou Spellbook
安排商队往返|Assign Caravan Route
播放背景音乐|Play background music
试听兵器碰撞|Test Weapon Clashes
试听施工敲击|Test Construction
试听建筑落成|Test Building Completion
签订停战贸易|Sign Trade Truce
跟随整体难度|Use Overall Difficulty
推荐初次游玩|Recommended for beginners
调整电脑难度|Adjust AI Difficulty
十国与五时代|Ten Nations & Five Ages
请选择运输船|Select a transport
船上没有单位|No units aboard
建筑尚未完工|Building not complete
训练队列已满|Training queue full
已达最高时代|Maximum age reached
寻找深海鱼群|Find deep-water fish
装载附近陆军|Load Nearby Troops
攻击沿途敌人|Fight en route
停止当前任务|Stop the current task
正前往采集点|Moving to gather
科技强化全军|Research strengthens your army
等待安排商路|Awaiting trade route
继续我的王国|Continue My Kingdom
等待触摸启动|Waiting for a touch to start
中打开此游戏|to open this game
添加到主屏幕|Add to Home Screen
开启新战役|Start New Campaign
选择此奖励|Choose Reward
请选择奖励|Choose a reward
本国英雄生命|Your hero health
国家技能冷却|national ability cooldown
KC 火焰伤害|KC fire damage
附近最多|Up to
名骑兵速度|nearby cavalry: speed
名近战步兵所受伤害|nearby melee infantry: incoming damage
名远程陆军|nearby ranged land units
名陆军护甲|nearby land units: armor
名受伤陆军各恢复|wounded land units each recover
内单个敌方陆军受到|range: one enemy land unit takes
内最多|range: up to
名敌方陆军各受|enemy land units each take
持续|for
不攻击建筑或舰船|does not target buildings or ships
先击败随机出现的一名 KC 守卫|Defeat the one randomly selected KC guardian first
先击败 KC 要塞守卫|Defeat the KC guardian first
建议 V 时代、成规模部队与英雄；初级部队无法伤害|Recommended: Age V, a substantial army and a hero. Early-age troops cannot damage
挑战需要 V 时代军队，低时代无法伤害守卫|requires an Age V army. Earlier-age troops cannot damage the guardian
挑战需要 V 时代与成规模军队|requires Age V and a substantial army
时代挑战：预警喷火、近战撕咬；守卫范围有限|challenge: telegraphed fire and melee bites within a limited territory
时代挑战：重斩与远程狱火，需集结军队|challenge: heavy cleaves and ranged hellfire. Assemble an army
时代机械化分支：昂贵的蒸汽装甲车与远程迫击炮|industrial branch: costly steam crawlers and long-range mortars
时代：连发步枪卫队与战地军医，研发电报侦察|: rifle guards and field medics; research telegraph reconnaissance
蒸汽装甲车护甲 +2，火炮护甲|Steam crawler armor +2; artillery armor
远程陆军射程每级|Ranged land unit range per level
最多两级|up to two levels
人口上限每级 +20，仍需建造房屋|Population limit +20 per level; houses still required
全军每级减伤 3、生命|Army armor +3 per level; health
全军攻击力每级|Army attack per level
村民采集效率每级|Villager gathering rate per level
范围内伐木效率 +10%，同类不叠加|nearby wood gathering +10%; does not stack
舰船生命 +8%；农田产出|Ship health +8%; farm yield
建筑木材成本 −10%；伐木|Building wood cost −10%; wood gathering
骑兵训练时间 +10%；造船木材|Cavalry training time +10%; ship wood cost
军事单位训练时间 +8%；舰船射程|Military training time +8%; ship range
本时代|Current age
军队人口最多|Military population limit
支 · 累计贸易黄金|caravans · Lifetime trade gold
支商队，完成往返后结算|caravans; gold paid after a round trip
点选部队 → 点敌人攻击 / 点空地脱战 · 拖动地图|Select troops → enemy to attack / ground to disengage · Drag to pan
点选单位，再点目标指挥；长按选同类|Select a unit, then its target. Long-press to select similar units
选择目标，下达移动或攻击命令|Choose a target to move or attack
点击地面移动，点击敌人攻击|Select ground to move or an enemy to attack
点击目的地，攻击沿途敌人|Select a destination and attack along the way
点击目的地：攻击前进|Choose destination: attack-move
选择下方命令发展你的王国|Use the commands below to develop your kingdom
点击己方营地附近空地放置|Choose clear ground near your settlement
点击目标下达命令|Select a target to give orders
点击村民采集资源，点击兵营训练士兵|Select villagers to gather; select barracks to train troops
请刷新后重试|Refresh and try again
请刷新重试|Refresh and try again
移动 / 脱战|Move / Disengage
移动 · 脱离战斗|Move · Disengage
移动 / 攻击|Move / Attack
黄金 / 20 魔力|gold / 20 mana
魔力 · 最多 5 名陆军|mana · Up to 5 land units
船舱 6 人口|Cargo: 6 population
海岸 / 岛屿附近|Near a coast / island
人口 · 靠岸装卸|population · Load/unload near shore
启用战争迷雾（玩家与电脑均受视野限制|Enable fog of war (players and AI have limited vision
开拓：采集、市场、商队与初级部队|Exploration: gathering, markets, caravans and early troops
殖民：国家特色建筑与兵种，骑兵、医师、铁匠铺|Settlement: unique national units and buildings, cavalry, medics and blacksmiths
要塞：炮兵、重舰、国家专属学说|Fortress: artillery, heavy ships and national doctrines
帝国：皇家大学、近卫兵工厂；近卫戟兵、龙骑兵、工程师；弹道、后勤、野战医疗、棱堡筑城|Empire: Royal University and Guard Arsenal; halberdiers, dragoons and engineers; ballistics, logistics, medicine and fortifications
传奇：皇家铸炮厂、国家统帅府；重型榴弹炮、国家英雄；爆破弹药与统帅学|Legend: Royal Foundry and Command Palace; heavy howitzers and national heroes; shells and command research
精密机械工坊|Precision Workshop
电报与军械局|Signal & Ordnance Bureau
连发步枪卫队|Repeating Rifle Guard
蒸汽装甲车|Steam Armored Crawler
长管迫击炮|Long-barrel Mortar
战地军医|Field Medic
轧制钢板|Rolled Steel
精制发射药|Refined Propellant
野战电报|Field Telegraphy
风岬海岸|Windcape Coast
镜湖盆地|Mirror Lake Basin
断崖古道|Cliffside Pass
群岛王庭|Isles of the Crown
双河内陆|Twin Rivers
王冠高地|Crown Highlands
边境中立商站|Frontier Trading Post
失落遗迹|Lost Ruins
西境驿站|Western Trading Post
东境商站|Eastern Trading Post
河畔集市|Riverside Market
糖豆 · 龙鳞铠甲|Tangdou · Dragonscale Armor
糖豆 · 秘法书|Tangdou · Spellbook
糖豆宝藏|Tangdou Treasure
糖豆秘法书|Tangdou Spellbook
熔岩龙|Lava Dragon
深渊守卫|Abyssal Demon
中立要塞|Neutral Fortress
中立守卫|Neutral Guardian
珍珠|Pearl
城镇中心|Town Center
步兵营|Barracks
射击场|Archery Range
铁匠铺|Blacksmith
炮兵工坊|Artillery Workshop
造船厂|Shipyard
采石场|Quarry
海滨浴场|Seaside Baths
伐木营地|Lumber Camp
岸防炮台|Coastal Battery
连弩工坊|Repeater Workshop
皇家马术学院|Royal Riding Academy
皇家军械所|Royal Armory
王家方阵学院|Royal Tercio Academy
武家道场|Samurai Dojo
帝国议政院|Imperial Council
沙皇军械库|Tsar's Armory
王家操练院|Royal Drill Hall
联合商会|United Guildhall
大陆议事厅|Continental Congress
皇家大学|Royal University
近卫兵工厂|Guard Arsenal
皇家铸炮厂|Royal Foundry
国家统帅府|Command Palace
长枪步兵|Pikeman
弓箭手|Archer
火枪兵|Musketeer
掷弹兵|Grenadier
攻城火炮|Siege Cannon
战地医师|Healer
轻骑斥候|Hussar Scout
戟兵|Halberdier
散兵|Skirmisher
攻城臼炮|Siege Mortar
长弓卫士|Longbow Guard
皇家胸甲骑兵|Royal Cuirassier
诸葛连弩兵|Chu Ko Nu
诸葛连弩|Chu Ko Nu
禁卫火枪兵|Janissary
射击军|Streltsy
普鲁士掷弹卫队|Prussian Guard
大方阵枪兵|Tercio Pikeman
拿骚神射手|Nassau Sharpshooter
大陆军步枪兵|Continental Rifleman
近卫戟兵|Elite Halberdier
龙骑兵|Dragoon
军械工程师|Engineer
重型榴弹炮|Heavy Howitzer
轻型护航舰|Sloop
重型护卫舰|Heavy Frigate
迫击炮舰|Mortar Ship
运输船|Transport
贸易商队|Trade Caravan
航海术|Navigation
加固船体|Reinforced Hulls
精炼武器|Refined Weapons
强化护甲|Reinforced Armor
高效采集|Efficient Gathering
远射军械|Long-range Armaments
重骑甲胄|Cavalry Barding
连弩机括|Repeater Mechanism
武士道|Bushido
军团轮射|Volley Drill
冬季补给|Winter Supply
线列纪律|Line Discipline
方阵战术|Pike Formation
海陆商约|Maritime Trade Charter
民兵操典|Militia Drill
精密弹道|Precision Ballistics
军团后勤|Army Logistics
野战医疗|Field Medicine
棱堡筑城|Bastion Fortifications
爆破弹药|Explosive Shells
统帅学|Command Doctrine
齐射号令|Volley Command
骑兵冲锋|Cavalry Charge
连弩箭雨|Repeater Barrage
拔刀横扫|Iaido Sweep
禁卫火力|Janissary Fire
坚韧集结|Resolute Rally
铁壁纪律|Iron Discipline
方阵壁垒|Tercio Bulwark
野战补给|Field Resupply
精准狙击|Precision Shot
霜环|Frost Ring
守护结界|Protective Ward
开拓时代|Exploration Age
殖民时代|Settlement Age
要塞时代|Fortress Age
帝国时代|Imperial Age
传奇时代|Legendary Age
边境王国：海岸帝国|Frontier Kingdom: Coastal Empires
边境王国|Frontier Kingdom
十国争锋 · 架空历史|Ten Nations · Alternate History
从一片原野，到一个王国。|From open wilderness to a thriving kingdom.
大陆与群岛|Mainland & Islands
边境战役|Frontier Campaign
海岸远征军|Coastal Expedition
海岸远征|Coastal Expedition
英国|Britain
法国|France
中国|China
日本|Japan
奥斯曼|Ottoman Empire
俄罗斯|Russia
普鲁士|Prussia
西班牙|Spain
荷兰|Netherlands
美国|United States
沙盒|Sandbox
入门|Beginner
休闲|Relaxed
标准|Standard
困难|Hard
专家|Expert
海军与农业|Navy & Agriculture
重骑与冲锋|Cavalry & Charges
建设与连弩|Construction & Repeaters
武士与近战|Samurai & Melee
火枪与军团|Muskets & Legions
人力与持久|Manpower & Endurance
纪律与火力|Discipline & Firepower
枪阵与矿业|Pikes & Mining
贸易与射手|Trade & Marksmen
后期共和国|Late Republic
电脑数量|AI Opponents
商队路线|Caravan Routes
终止协定|End Pact
本国商队|Your Caravans
音乐音量|Music Volume
音效音量|Effects Volume
试听炮击|Test Cannon Fire
外交与贸易|Diplomacy & Trade
声音与音乐|Sound & Music
同队盟友|Teammates
已经是同队盟友|Already on your team
停战贸易|Trade Truce
攻击前进|Attack-move
攻打建筑|Attack Building
攻击敌军|Attack Enemy
继续施工|Resume Construction
唯一英雄|Unique Hero
未知难度|Unknown difficulty
电脑采集|AI gathering
全部电脑|All AI Opponents
应用难度|Apply Difficulty
查看国家|View Nation
特色建筑|Unique Building
国家研发|National Research
特色兵种|Unique Unit
国家专属兵种|Unique National Units
选择你的国家|Choose Your Nation
训练与研究|Training & Research
已指定攻击|Attack Confirmed
已安排采集|Gathering Assigned
已安排施工|Construction Assigned
已确认移动|Move Confirmed
已取消建造|Build Cancelled
自动捕鱼|Auto-fish
靠岸卸载|Unload Ashore
立即撤退|Retreat Now
脱离战斗|Disengage
停止攻击|Stop Attacking
你的王国|Your Kingdom
施工进度|Build Progress
正在采集|Gathering
攻击目标|Attack Target
敌军情报|Enemy Details
建设王国|Build Your Kingdom
战场指挥|Battle Commands
运回货物|Returning Cargo
前往贸易|Travelling to Trade
建造完成|Construction Complete
战役用时|Battle Time
集结部队|Rally Troops
训练村民|Train Villager
原地待命|Hold Position
对手国家|Opponent Nation
海陆作战|Land & Naval Warfare
四类资源|Four Resources
选择舰队|Select Fleet
确认建造|Confirm Build
再建一个|Build Another
继续点地图放下一个，取消结束|tap the map to place the next one, Cancel to finish
全屏游玩|Fullscreen
音频状态|Audio Status
需要恢复|Restore Needed
已启动|Running
安装应用|Install App
返回游戏|Return to Game
安装说明|Installation Guide
远征地图|Expedition Map
地图工具|Map Tools
战局已暂停|Battle Paused
继续战斗|Resume Battle
重新开始|Restart
返回战场|Return to Battle
选择全部军队|Select Army
选择空闲村民|Idle Villagers
返回主城|Go Home
展开地图缩放|Expand Zoom Controls
关闭声音设置|Close Audio Settings
关闭难度设置|Close Difficulty Settings
关闭帝国图鉴|Close Codex
关闭 KC 挑战|Close KC Challenge
上一组命令|Previous Commands
下一组命令|Next Commands
边境王国主页|Frontier Kingdom Home
关闭音效|Mute Effects
开启音效|Enable Effects
训练你的军队|Train Your Army
发展你的王国|Grow Your Kingdom
点击战场选择|Select on the Battlefield
资源不足|Not enough resources
每方最多 3 座城镇中心|At most 3 town centres per side
离己方城镇中心太近|Too close to one of your town centres
电脑建立了新的城镇中心|The computer founded a new town centre
超出地图|Outside the map
船舱已满|Transport full
队列已满|Queue full
研究完成|Research Complete
斥候警报|Scout Alert
魔法冷却|Spell cooldown
魔力不足|Not enough mana
难度保持不变|Difficulty unchanged
英雄重招等待|Hero recruitment available in
技能黄金不足|Not enough gold for this ability
请选择英雄|Select a hero
时代与研发|Ages & Research
研究建筑|Research building
贸易 +1 黄金/秒|Trade +1 gold/sec
军事单位食物成本|Military food cost
军事单位黄金成本|Military gold cost
英雄技能冷却缩短|Hero ability cooldown reduced
近战步兵攻击|Melee infantry attack
建筑石料成本|Building stone cost
军事训练时间|Military training time
村民训练时间|Villager training time
村民采金效率|Villager gold gathering
炮兵训练时间|Artillery training time
近战步兵生命|Melee infantry health
商队收益额外|Additional caravan income
村民采食效率|Villager food gathering
近战与火枪步兵生命|Melee and musket infantry health
近战步兵与骑兵生命|Melee infantry and cavalry health
武士与近战步兵移动|Samurai and melee infantry speed
火枪类训练时间|Musketeer training time
火枪类射击间隔|Musketeer firing interval
火枪类护甲|Musketeer armor
火枪类伤害|Musketeer damage
长弓卫士射程|Longbow Guard range
诸葛连弩伤害|Chu Ko Nu damage
陆军炮兵伤害|Land artillery damage
舰船航速每级|Ship speed per level
舰船生命每级|Ship health per level
采金效率|Gold gathering rate
骑兵护甲|Cavalry armor
舰船生命|Ship health
商队收益|Caravan income
建筑生命|Building health
需要时代|Requires Age
要塞周围无法建造|Cannot build around the fortress
保护期内双方暂不交战|Combat is temporarily restricted
已退出战役|has been defeated
已退出|Defeated
已终止与|Ended pact with
的停战贸易|trade truce
已改为|changed to
已发动|activated
已装载|Loaded
已卸载|Unloaded
已就绪|Ready
已完工|Complete
已选择|Selected
已安排|Assigned
已探索遗迹|Explored Ruins
已获得|Acquired
施工中|Under Construction
训练中|Training
秒冷却|sec cooldown
个目标|targets
名单位|units
个单位|units
名电脑|AI
名士兵，点击目标指挥|soldiers. Select a target to command
名空闲村民|idle villagers
个已选择|selected
支商队|caravans
名部队。点敌人攻击，点空地脱战|troops. Select an enemy to attack or ground to disengage
损失|losses
需要|Requires
冷却|Cooldown
补给|Supply
难度|Difficulty
伤害|damage
取舍|Tradeoff
生命|health
攻击|attack
射程|range
建筑|building
敌方|Enemy
木材|Wood
食物|Food
黄金|Gold
石料|Stone
渔船|Fishing Boat
村民|Villager
电脑|AI
国家|Nation
队伍|Team
盟友|Ally
本地战场|Local battlefield
本国|Your nation
敌对|Hostile
中立|Neutral
市场|Market
贸易|Trade
武士|Samurai
统帅|Commander
港口|Dock
人口|Population
房屋|House
农田|Farm
马厩|Stable
箭塔|Tower
教堂|Church
要塞|Fortress
骑兵|Cavalry
免费|Free
暂停|Pause
用时|Time
晋升|Advance
时代|Age
训练|Train
停战|Truce
敌军|Enemy
魔力|Mana
载员|Cargo
放置|Place
取消|Cancel
伐木|Logging
采金|Gold Mining
采石|Quarrying
耕作|Farming
畜牧|Herding
捕鱼|Fishing
采食|Foraging
继续|Continue
兵营|Barracks
步兵|Infantry
建造|Build
海军|Navy
点选|Select
框选|Box
移图|Pan
撤退|Retreat
声音|Audio
开启|Start
缩放|Zoom
获得|Gained
施工|Building
采集|Gather
选择|Select
远征军|Expedition
秒|sec
桜|✿
鹰|♜
橙|●
龍|◈
队|team
人|troops
第|No.
你|You
与|and
以|With
查看本地战场|View local battlefield
`;const entries=pairs.trim().split('\n').filter(Boolean).map(l=>{const i=l.indexOf('|');return[l.slice(0,i),l.slice(i+1)]});root.KingdomLocaleData=Object.fromEntries(entries);if(typeof module!=='undefined')module.exports=root.KingdomLocaleData})(typeof window==='undefined'?globalThis:window);
