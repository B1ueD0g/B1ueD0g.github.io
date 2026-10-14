// Real-browser acceptance for the page-local v2 game; no controller cheat API is used.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const option=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};
const {chromium}=require(option('--playwright-module','playwright'));
const base=option('--base-url','http://127.0.0.1:8767');
const output=option('--output-dir',path.join(process.env.HOME,'.codex/work/blog-enhance-20261014/QA/404-dog-v2'));
const bestKey='bluedog-trail-best-v2';
const delta={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
const arrows={up:'ArrowUp',right:'ArrowRight',down:'ArrowDown',left:'ArrowLeft'};
const wasd={up:'w',right:'d',down:'s',left:'a'};
const opposite={up:'down',right:'left',down:'up',left:'right'};
const pointKey=point=>point.join(',');
const shape=map=>JSON.stringify({walls:[...map.walls].sort(),start:map.start,mailbox:map.mailbox,stars:map.stars,bone:map.bone,portals:map.portals});
function destination(map,point,direction){
 const [dx,dy]=delta[direction]||[99,99],entry=[point[0]+dx,point[1]+dy];
 if(entry[0]<0||entry[1]<0||entry[0]>=map.columns||entry[1]>=map.rows||map.walls.includes(pointKey(entry)))return null;
 const portal=map.portals.findIndex(p=>pointKey(p)===pointKey(entry));
 return {point:portal<0?entry:map.portals[1-portal],portal:portal>=0};
}
// Independent BFS includes forced portal transitions and treats delivery as terminal.
function route(map,current,goal='delivery'){
 const starBits=new Map(map.stars.map((point,index)=>[pointKey(point),1<<index]));
 let mask=0;for(const key of current.collected)mask|=starBits.get(key)||0;
 const queue=[{point:[current.x,current.y],mask,steps:[]}],seen=new Set([`${current.x},${current.y}|${mask}`]);
 for(let head=0;head<queue.length;head++){
  const item=queue[head],atMailbox=pointKey(item.point)===pointKey(map.mailbox);
  if(goal==='delivery'?item.mask===7&&atMailbox:goal==='stars'?item.mask===7:pointKey(item.point)===pointKey(goal))return item.steps;
  if(item.mask===7&&atMailbox)continue;
  for(const direction of Object.keys(delta)){
   const next=destination(map,item.point,direction);if(!next)continue;
   const nextMask=item.mask|(starBits.get(pointKey(next.point))||0),key=`${pointKey(next.point)}|${nextMask}`;
   if(seen.has(key))continue;seen.add(key);queue.push({point:next.point,mask:nextMask,steps:item.steps.concat(direction)});
  }
 }return null;
}
function lossCycle(map,current){
 const choices=[];
 for(let y=0;y<map.rows;y++)for(let x=0;x<map.columns;x++){
  const first=[x,y];if(map.walls.includes(pointKey(first))||[map.mailbox,map.bone,...map.portals].some(point=>pointKey(point)===pointKey(first)))continue;
  for(const direction of Object.keys(delta)){
   const next=destination(map,first,direction);if(!next||next.portal||[map.mailbox,map.bone,...map.portals].some(point=>pointKey(point)===pointKey(next.point)))continue;
   const back=destination(map,next.point,opposite[direction]);if(!back||back.portal||pointKey(back.point)!==pointKey(first))continue;
   const approach=route(map,current,first);if(approach)choices.push({approach,directions:[direction,opposite[direction]]});
  }
 }
 return choices.sort((a,b)=>a.approach.length-b.approach.length)[0];
}
const mapOf=async page=>JSON.parse(await page.locator('#dog-map').textContent());
async function stateOf(page){return page.locator('#dog-board').evaluate(e=>({x:+e.dataset.x,y:+e.dataset.y,found:+e.dataset.found,moves:+e.dataset.moves,mode:e.dataset.mode,phase:e.dataset.phase,score:+e.dataset.score,remaining:e.dataset.remaining===''?null:+e.dataset.remaining,portalJumps:+e.dataset.portalJumps}));}
const tracker=map=>({x:map.start[0],y:map.start[1],collected:[],bone:false,moves:0,remaining:map.mode==='challenge'?map.budget:null,score:0,portalJumps:0,phase:'playing'});
async function assertState(page,model,map){
 const actual=await stateOf(page);
 assert.deepEqual(actual,{x:model.x,y:model.y,found:model.collected.length,moves:model.moves,mode:map.mode,phase:model.phase,score:model.score,remaining:model.remaining,portalJumps:model.portalJumps},'Rendered game state disagrees with the independent movement model');
 return actual;
}
async function step(page,map,model,direction,input='keyboard'){
 const next=destination(map,[model.x,model.y],direction),before=await stateOf(page);
 if(input==='tap')await page.locator(`[data-dog-move="${direction}"]`).tap();
 else{await page.locator('#dog-board').focus();await page.keyboard.press((input==='wasd'?wasd:arrows)[direction]);}
 if(!next){assert.deepEqual(await stateOf(page),before,'Blocked move changed progress');return;}
 model.x=next.point[0];model.y=next.point[1];model.moves++;if(model.remaining!==null)model.remaining--;
 if(next.portal)model.portalJumps++;
 const key=pointKey(next.point);
 if(map.stars.some(p=>pointKey(p)===key)&&!model.collected.includes(key)){model.collected.push(key);model.score+=100;}
 if(key===pointKey(map.bone)&&!model.bone){model.bone=true;model.score+=50;if(model.remaining!==null)model.remaining+=3;}
 if(key===pointKey(map.mailbox)&&model.collected.length===3){model.phase='won';model.score+=100+(map.mode==='challenge'?model.remaining*10:Math.max(0,40-model.moves)*5);}
 else if(model.remaining===0)model.phase='lost';
 await assertState(page,model,map);
}
async function walk(page,map,model,steps,input){assert(Array.isArray(steps),'Independent route is unreachable');for(const direction of steps)await step(page,map,model,direction,input);}
async function start(page,map){await page.locator('#dog-start').click();assert.deepEqual(await mapOf(page),map,'Replay must preserve the exact island');assert.equal(await page.evaluate(()=>document.activeElement.id),'dog-board');const model=tracker(map);await assertState(page,model,map);return model;}
async function complete(page,map,model,input){
 await walk(page,map,model,route(map,model,'stars'),input);assert.equal(model.collected.length,3);assert.equal((await stateOf(page)).phase,'playing','Three stars completed the game before mailbox delivery');
 await walk(page,map,model,route(map,model),input);assert.equal((await stateOf(page)).phase,'won');assert(await page.locator('#dog-result').isVisible());assert(await page.locator('#dog-next').isVisible());
}
async function outputNumber(page,id){const text=await page.locator(id).textContent();const match=text.match(/\d[\d,]*/);assert(match,`${id} has no numeric output`);return Number(match[0].replaceAll(',',''));}
async function layout(page,width){
 const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,board:document.querySelector('#dog-board').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.dog-not-found button')].filter(e=>e.getClientRects().length).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),...e.getBoundingClientRect().toJSON()}))}));
 assert(geometry.scrollWidth<=width+1,'404 page overflows horizontally');assert(geometry.board.left>=0&&geometry.board.right<=width,'Map is clipped');
 assert(geometry.buttons.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=width),'Native game/search controls must retain 44px targets');return geometry;
}
async function ready(page){await page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});await page.waitForSelector('.dog-not-found.is-playable');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);}
async function newPage(browser,{width=1440,theme='light',reduce=true,storage}={}){
 const context=await browser.newContext({viewport:{width,height:width<=390?844:1000},hasTouch:width<=390,isMobile:width<=390,reducedMotion:reduce?'reduce':'no-preference'});
 await context.addInitScript(({theme,storage,key})=>{
  localStorage.setItem('pref-theme',theme);
  if(typeof storage==='string')localStorage.setItem(key,storage);
  if(storage==='unavailable'){
   for(const method of ['getItem','setItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(name,...args){if(name===key)throw new DOMException('Storage unavailable','SecurityError');return original.call(this,name,...args);};}
  }
 },{theme,storage,key:bestKey});
 const page=await context.newPage();return {context,page};
}
async function reward(page,archive){const href=await page.locator('#dog-result-link').getAttribute('href');assert(archive.some(post=>post.url===href),'Reward is not in the current real archive');assert.equal((await page.request.get(new URL(href,base).href)).status(),200);return href;}
(async()=>{
 await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});const results=[],errors=[];
 try{
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const {context,page}=await newPage(browser,{width,theme});page.on('pageerror',e=>errors.push(e.message));await ready(page);
   const map=await mapOf(page),archive=JSON.parse(await page.locator('#dog-archive').textContent());assert.equal(map.mode,'free');assert.equal(map.level,1);assert.equal((await stateOf(page)).phase,'ready');
   assert.equal(await page.locator('[data-dog-mode=free]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-dog-move]:disabled').count(),4);
   const geometry=await layout(page,width);await page.screenshot({path:path.join(output,`${width}-${theme}-ready.png`),fullPage:true});
   const requests=[];page.on('request',request=>requests.push(request.url()));const input=width===390?'tap':'wasd';let model=await start(page,map);
   await page.evaluate(()=>document.addEventListener('keydown',e=>{window.__dogLastPrevented=e.defaultPrevented;}));
   const beforeInput=await stateOf(page);await page.locator('#dog-query').fill('wasd');await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>window.__dogLastPrevented),false);await page.keyboard.press('w');assert.equal(await page.evaluate(()=>window.__dogLastPrevented),false);assert.deepEqual(await stateOf(page),beforeInput);
   await page.locator('.dog-exits a').first().focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>window.__dogLastPrevented),false);assert.deepEqual(await stateOf(page),beforeInput);
   await page.locator('#dog-board').focus();await page.keyboard.press('Control+ArrowRight');assert.equal(await page.evaluate(()=>window.__dogLastPrevented),false);assert.deepEqual(await stateOf(page),beforeInput);
   // A rejected move must neither consume a step nor change the score/budget.
   let blockedChecked=false;
   for(let y=0;y<map.rows&&!blockedChecked;y++)for(let x=0;x<map.columns&&!blockedChecked;x++)if(!map.walls.includes(`${x},${y}`)){
    const blocked=Object.keys(delta).find(direction=>!destination(map,[x,y],direction));if(!blocked)continue;const toEdge=route(map,model,[x,y]);if(!toEdge)continue;await walk(page,map,model,toEdge,input);await step(page,map,model,blocked,input);blockedChecked=true;
   }
   assert(blockedChecked,'No boundary/bush collision exercised');
   model=await start(page,map);await walk(page,map,model,route(map,model,map.bone),input);assert.equal(model.bone,true);const boneScore=model.score;
   const leaveBone=Object.keys(delta).find(direction=>{const next=destination(map,[model.x,model.y],direction);return next&&pointKey(next.point)!==pointKey(map.mailbox);});assert(leaveBone);
   await step(page,map,model,leaveBone,input);await walk(page,map,model,route(map,model,map.bone),input);assert.equal(model.score,boneScore+100*(model.collected.length-(boneScore-50)/100),'Re-entering the bone awarded another bonus');
   const jumpsBefore=model.portalJumps;await walk(page,map,model,route(map,model,map.portals[0]),input);assert(model.portalJumps>jumpsBefore,'Portal was never entered');
   await complete(page,map,model,input);const freeScore=model.score;await reward(page,archive);assert.equal(await outputNumber(page,'#dog-best'),freeScore);
   assert.equal(await page.locator('.dog-not-found').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'Reduced-motion gameplay animates');
   await page.locator('#dog-board').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'dog-start');
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(output,`${width}-${theme}-won.png`),fullPage:true});
   model=await start(page,map);assert.equal(await outputNumber(page,'#dog-best'),freeScore);await complete(page,map,model,input);
   await page.locator('#dog-next').click();const nextMap=await mapOf(page);assert.equal(nextMap.level,2);assert.notEqual(nextMap.seed,map.seed);assert.notEqual(shape(nextMap),shape(map),'Next island only changed its seed label');assert.equal((await stateOf(page)).phase,'playing');assert.equal(await page.evaluate(()=>document.activeElement.id),'dog-board');
   await page.locator('#dog-shuffle').click();const shuffled=await mapOf(page);assert.equal(shuffled.level,2);assert.notEqual(shuffled.seed,nextMap.seed);assert.notEqual(shape(shuffled),shape(nextMap),'Shuffle only changed its seed label');assert.equal(await page.evaluate(()=>document.activeElement.id),'dog-board');
   await page.locator('[data-dog-mode=challenge]').click();let challenge=await mapOf(page);assert.equal(challenge.mode,'challenge');assert.equal(challenge.level,1);assert.notEqual(shape(challenge),shape(shuffled));assert.equal(await page.locator('[data-dog-mode=challenge]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-dog-mode=free]').getAttribute('aria-pressed'),'false');assert.equal(await outputNumber(page,'#dog-best'),0);
   model=tracker(challenge);await assertState(page,model,challenge);
   // Bonus reachability is not a promise that every challenge map can afford that detour.
   // Select a suitable real island with bounded native shuffle actions, without changing the generator.
   let challengeBoneRoute,challengeBonusFixtureAttempts=0;
   for(;challengeBonusFixtureAttempts<8;challengeBonusFixtureAttempts++){
    model=tracker(challenge);challengeBoneRoute=route(challenge,model,challenge.bone);
    if(challengeBoneRoute&&challengeBoneRoute.length<=challenge.budget)break;
    await page.locator('#dog-shuffle').click();challenge=await mapOf(page);
   }
   assert(challengeBonusFixtureAttempts<8,'Could not select a budget-affordable bonus fixture in eight real islands');
   await walk(page,challenge,model,challengeBoneRoute,input);assert.equal(model.bone,true);assert.equal(model.remaining,challenge.budget-challengeBoneRoute.length+3,'Controller failed to render the three-move bone bonus');
   model=await start(page,challenge);await complete(page,challenge,model,input);await reward(page,archive);const challengeScore=model.score;assert.equal(await outputNumber(page,'#dog-best'),challengeScore);
   const stored=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),bestKey));assert(stored.free>=freeScore);assert.equal(stored.challenge,challengeScore);
   // Deliberately revisit safe cells until the move budget expires; no clock/timer is involved.
   model=await start(page,challenge);const cycle=lossCycle(challenge,model);assert(cycle,'No safe two-cell loss fixture is reachable');
   for(const direction of cycle.approach){if(model.phase!=='playing')break;await step(page,challenge,model,direction,input);}
   for(let count=0;model.phase==='playing'&&count<challenge.budget+4;count++)await step(page,challenge,model,cycle.directions[count%2],input);
   assert.equal((await stateOf(page)).phase,'lost');assert.equal((await stateOf(page)).remaining,0);assert.equal(await page.locator('#dog-next').isVisible(),false);assert(await page.locator('#dog-result').isVisible());await reward(page,archive);
   assert.equal(await page.locator('[data-dog-move]:disabled').count(),4);await start(page,challenge);assert.equal(await outputNumber(page,'#dog-best'),challengeScore);
   assert.deepEqual(requests,[],'Playing/shuffling/restarting unexpectedly made network requests');
   // QA negative control: deliberately undersize real controls and prove geometry checks reject it.
   await page.addStyleTag({content:'.dog-direction-pad button{width:30px!important;height:30px!important;min-width:0!important;min-height:0!important}'});await assert.rejects(()=>layout(page,width),/44px/);
   await page.locator('#dog-query').fill('拓扑 安全');await Promise.all([page.waitForURL(u=>u.pathname==='/search/'),page.locator('.dog-search button').click()]);assert.equal(new URL(page.url()).searchParams.get('q'),'拓扑 安全');
   await ready(page);await Promise.all([page.waitForURL(u=>u.pathname.startsWith('/posts/')),page.locator('#dog-skip').click()]);assert(archive.some(post=>new URL(post.url,base).pathname===new URL(page.url()).pathname));
   results.push({width,theme,geometry,initialMap:map,challengeMap:challenge,challengeBonusFixtureAttempts:challengeBonusFixtureAttempts+1,freeScore,challengeScore,keyboardAndTouch:true,bonusOnce:true,challengeBoneExtraMoves:true,portalOnce:true,deliveryRequired:true,replay:true,next:true,shuffle:true,localBest:true,budgetLoss:true,inputIsolation:true,noPlayNetwork:true,undersizedNegativeRejected:true});await context.close();
  }
  // Storage denial and malformed records use the actual controller, not an emulated scoreboard.
  const storageResults=[];
  for(const storage of ['unavailable','{"free":-2,"challenge":"broken"}']){
   const {context,page}=await newPage(browser,{storage});page.on('pageerror',e=>errors.push(e.message));await ready(page);assert.equal(await outputNumber(page,'#dog-best'),0);const map=await mapOf(page);let model=await start(page,map);await complete(page,map,model,'keyboard');const best=model.score;assert.equal(await outputNumber(page,'#dog-best'),best);await start(page,map);assert.equal(await outputNumber(page,'#dog-best'),best,'Session best was lost after replay');storageResults.push({storage,score:best,sessionFallback:true});await context.close();
  }
  const persisted=await newPage(browser,{storage:'{"free":9000,"challenge":8000}'});await ready(persisted.page);assert.equal(await outputNumber(persisted.page,'#dog-best'),9000);await persisted.page.locator('[data-dog-mode=challenge]').click();assert.equal(await outputNumber(persisted.page,'#dog-best'),8000);await persisted.context.close();
  // Compact 320px fit, then native no-JavaScript exits/search.
  const compact=await newPage(browser,{width:320});await ready(compact.page);await layout(compact.page,320);await compact.page.locator('[data-dog-mode=challenge]').click();await layout(compact.page,320);await compact.context.close();
  for(const width of [1440,390,320])for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width,height:1000},javaScriptEnabled:false,colorScheme:theme});const page=await context.newPage();await page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('#dog-fallback a').count(),3);assert(await page.locator('#dog-fallback').isVisible());assert.equal(await page.locator('#dog-controls:visible').count(),0);assert.equal(await page.locator('#dog-modes:visible').count(),0);assert(await page.locator('.dog-exits').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.locator('#dog-query').fill('研究');await Promise.all([page.waitForURL(u=>u.pathname==='/search/'),page.locator('.dog-search button').click()]);assert.equal(new URL(page.url()).searchParams.get('q'),'研究');await context.close();
  }
  // Missing game bundle must expose the same useful native fallback.
  const fallback=await newPage(browser);await fallback.page.route('**/js/not-found-game*',request=>request.abort());await fallback.page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});assert(await fallback.page.locator('#dog-fallback').isVisible());assert.equal(await fallback.page.locator('#dog-controls').isVisible(),false);await fallback.context.close();
  // Inject a failure into the real engine's initialization boundary, leaving its controller unchanged.
  const failedEngine=await newPage(browser);const initializationErrors=[];failedEngine.page.on('pageerror',error=>initializationErrors.push(error.message));
  await failedEngine.context.addInitScript(()=>Object.defineProperty(globalThis,'BlueDogTrail',{configurable:true,set(api){Object.defineProperty(globalThis,'BlueDogTrail',{configurable:true,value:Object.freeze({...api,createMap(){throw new Error('QA engine initialization failure');}})});}}));
  await failedEngine.page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});await failedEngine.page.waitForSelector('#dog-status');assert(await failedEngine.page.locator('#dog-fallback').isVisible());assert.equal(await failedEngine.page.locator('#dog-controls').isVisible(),false);assert.equal(await failedEngine.page.locator('#dog-modes').isVisible(),false);assert.equal(await failedEngine.page.locator('.is-playable').count(),0);assert.deepEqual(initializationErrors,[]);await failedEngine.context.close();
  const motion=await newPage(browser,{reduce:false});await ready(motion.page);const map=await mapOf(motion.page);let model=await start(motion.page,map);const normal=Object.keys(delta).find(direction=>destination(map,[model.x,model.y],direction));await step(motion.page,map,model,normal);assert(await motion.page.locator('#dog-hop').evaluate(e=>e.getAnimations().some(a=>a.playState==='running')),'Normal move has no event animation');await motion.page.waitForTimeout(550);assert.equal(await motion.page.locator('.dog-not-found').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'Idle game has perpetual animation');
  await motion.page.locator('#dog-hop').evaluate(e=>{e.__nativeAnimate=e.animate;e.animate=function(k,o){return this.__nativeAnimate(k,{...o,duration:10000});};});const again=Object.keys(delta).find(direction=>destination(map,[model.x,model.y],direction));await step(motion.page,map,model,again);assert(await motion.page.locator('#dog-hop').evaluate(e=>e.getAnimations().some(a=>a.playState==='running')));await motion.page.emulateMedia({reducedMotion:'reduce'});await motion.page.waitForFunction(()=>document.querySelector('.dog-not-found').getAnimations({subtree:true}).every(a=>a.playState!=='running'),null,{timeout:1000});await motion.context.close();
  const home=await newPage(browser);await home.page.goto(base+'/');assert.equal(await home.page.locator('script[src*=not-found],link[href*=not-found]').count(),0,'404 game assets leaked onto the home page');await home.context.close();assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,storageResults,persistedPerModeBest:true,noJS:6,compact320:true,missingBundleFallback:true,engineFailureFallback:true,finiteMotion:true,reducedChange:true,pageErrors:errors},null,2));
  console.log('PASS: v2 404 game; 4 viewport/theme cases + 6 no-JS cases; independent portal movement, optional bonus once, delivery, both modes, replay/next/shuffle, local/session best, storage denial/corruption, keyboard/tap/input isolation, real article/search/skip, finite/reduced motion, no play network, geometry negative and page-local assets.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
