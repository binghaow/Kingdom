/* Explicit art recipes: no unit or building is mapped onto another type's sprite. */
((root)=>{'use strict';const nations={
britain:{roof:'#5c5261',cloth:'#9e343d',trim:'#d4bd83',wall:'#c2b49a',wood:'#574336',style:'tudor'},
france:{roof:'#415b78',cloth:'#426d9e',trim:'#e4cca0',wall:'#d1c4ac',wood:'#66513e',style:'mansard'},
china:{roof:'#527c67',cloth:'#a34335',trim:'#d4a44e',wall:'#ddd0ad',wood:'#773c2b',style:'pagoda'},
japan:{roof:'#414b55',cloth:'#4d5277',trim:'#d8c4a1',wall:'#dfd9bf',wood:'#423b31',style:'hipped'},
ottoman:{roof:'#4d9290',cloth:'#e4d9b8',trim:'#d4ae52',wall:'#d7c9a6',wood:'#78533a',style:'dome'},
russia:{roof:'#517354',cloth:'#934535',trim:'#dbb76d',wall:'#b78b6a',wood:'#654534',style:'onion'},
prussia:{roof:'#3e4a56',cloth:'#354e70',trim:'#d4bd82',wall:'#a2a8a0',wood:'#51483b',style:'steep'},
spain:{roof:'#aa6044',cloth:'#bd9652',trim:'#edcf93',wall:'#dcc6a0',wood:'#72513c',style:'arcade'},
netherlands:{roof:'#98533e',cloth:'#bd7037',trim:'#e2cc9b',wall:'#b38364',wood:'#664a37',style:'stepped'},
usa:{roof:'#5b6b73',cloth:'#4f7094',trim:'#e1cba0',wall:'#d5d4bb',wood:'#655443',style:'portico'}};
const sizes={town:[236,211],house:[132,133],barracks:[189,172],range:[183,159],farm:[169,112],stable:[187,155],tower:[113,173],blacksmith:[167,154],market:[193,154],church:[177,211],workshop:[193,166],fort:[310,270],dock:[200,149],shipyard:[235,190],bath:[185,142],quarry:[180,146],lumbercamp:[168,145],coastbattery:[201,151],royalarsenal:[203,182],ridingacademy:[215,177],repeaterworks:[201,173],dojo:[197,177],divan:[202,205],kremlin:[218,225],drillhall:[199,177],casahall:[209,200],guildhall:[199,218],congress:[222,187],university:[212,202],arsenal:[213,185],foundry:[211,220],palace:[285,270],steelworks:[228,224],signalbureau:[199,230],wall:[108,82],wallvertical:[90,174],gate:[145,145],gatevertical:[130,205],cannonturret:[149,162],siegeyard:[218,182],aerodrome:[253,244],kcreclaimed:[315,300]};
function hash(k){let h=2166136261;for(const c of k){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function profile(kind,defs){const d=defs[kind];if(!d)return null;if(d.building)return{kind,recipe:kind,width:sizes[kind]?.[0]||220,height:sizes[kind]?.[1]||220};let width=58,height=76;if(d.role==='cavalry'){width=92;height=94}if(d.role==='cannon'||['trebuchet','siegewagon'].includes(kind)){width=123;height=120}if(d.domain==='sea'){width=kind==='frigate'?175:kind==='fishingboat'?112:151;height=kind==='frigate'?181:kind==='fishingboat'?121:157}if(d.domain==='air'){width=kind==='scoutballoon'?107:161;height=kind==='scoutballoon'?171:146}if(d.hero){width+=10;height+=13}return{kind,recipe:kind,width,height,variation:hash(kind),role:d.role||'worker'}}
const api={nations,profile,hash,sizes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomArtProfiles=api;
})(typeof window==='undefined'?globalThis:window);
