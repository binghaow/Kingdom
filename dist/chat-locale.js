((root)=>{Object.assign(root.KingdomLocaleData,Object.fromEntries(`
糖豆和团团暂时回家了，再次输入密匙可召回|Tangdou and Tuantuan have gone home. Enter the key again to bring them back
无限资源已关闭，恢复开启前的资源|Unlimited resources disabled. Your previous resource balance has been restored
无限资源已开启；时代、科技和建造仍需按流程完成。再次输入可关闭|Unlimited resources enabled. Ages, research and construction still follow the usual progression. Enter again to disable
轻缓中世纪氛围：三段缓慢变奏，柔和弦乐、木笛和稀疏鲁特琴。敲击仅在当前画面内响起；采矿和施工使用低沉音色。选择、受击与落成声独立混音。|Gentle medieval atmosphere: three slowly varying chapters with soft strings, woodwind and sparse lute. Work sounds play only inside your view, with low-pitched mining and building. Selection, damage and completion have their own effects.
试听采石|Preview Stone Mining
试听建筑受击|Preview Building Impact
试听建筑倒塌|Preview Building Collapse
试听动物|Preview Animal
试听恶龙|Preview Dragon
试听伙伴攻击|Preview Companion Attack
选择村民后点击此处采集。|Select a villager and click here to gather.
资源|Resources
牛|Cow
羊|Sheep
战役已结束|The battle has ended
团团|Tuantuan
可爱的单机彩蛋伙伴：星星魔法、强力攻击，可挑战 KC 守卫|A cute single-player companion with powerful star magic, able to challenge KC guardians
可爱的单机彩蛋伙伴：守护星光、自我恢复，可挑战 KC 守卫|A cute single-player companion with protective starlight and regeneration, able to challenge KC guardians
伙伴不能通过建筑训练|Companions cannot be trained at buildings
这个彩蛋只在单机战役生效|This Easter egg is available only in single-player campaigns
战役已结束，请在新战役中召唤伙伴|The battle has ended. Summon companions in a new campaign
需要己方城镇中心才能召唤伙伴|You need your own Town Center to summon companions
星光闪过：糖豆和团团来守护你的王国了！|A flash of starlight! Tangdou and Tuantuan have come to protect your kingdom!
糖豆和团团已经在你的阵营中|Tangdou and Tuantuan are already on your side
只能向电脑盟友下达协作指令|Cooperative orders can only be sent to allied AI players
缺少可用的城镇中心|No usable Town Center
请在已探索区域选择集结位置|Choose a rally point in explored territory
尚未发现这个敌人的城镇中心，先侦察再进攻|That enemy Town Center has not been discovered. Scout before attacking
未知协作指令|Unknown cooperative order
收到，已派出|Understood. Dispatching
名部队执行任务|troops to carry out your order
收到，正在集结可用部队|Understood. Gathering available troops
当前聊天尚未连接真人联机服务|Chat is not connected to a human multiplayer service yet
当前没有电脑队友；开局时把一名电脑设为第 1 队即可协作|No allied AI. Set an AI player to Team 1 before starting to cooperate
可用军队|Available troops
名，当前时代|; current age
收到，队友！我们一起守护王国|Understood, teammate! Let's protect the kingdom together
可以让我防守、集结、进攻、撤退或报告状态|Ask me to defend, rally, attack, retreat or report status
打开战场聊天|Open Battlefield Chat
战场聊天|Battlefield Chat
关闭聊天|Close Chat
单机电脑队友 · 尚未连接真人联机|Single-player AI teammates · Human multiplayer not connected
发送给|Send to
聊天对象|Chat Recipient
所有电脑队友|All Allied AI
聊天消息|Chat Message
防守我|Defend Me
在此集结|Rally Here
协同进攻|Attack Together
报告状态|Report Status
输入消息或战术指令…|Message or tactical order…
发送|Send
例如：支援我、进攻电脑 2、撤退。集结位置取当前画面中心。|Try: help, attack AI 2, retreat. Rally Here uses the center of your current view.
系统|System
`.trim().split('\n').map(l=>{const i=l.indexOf('|');return[l.slice(0,i),l.slice(i+1)]})));if(typeof module!=='undefined')module.exports=root.KingdomLocaleData})(typeof window==='undefined'?globalThis:window);
