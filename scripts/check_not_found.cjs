// A real-browser acceptance check for the production 404 game, not a second game implementation.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const option=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};
const {chromium}=require(option('--playwright-module','playwright'));
const base=option('--base-url','http://127.0.0.1:8767');
const output=option('--output-dir',path.join(process.env.HOME,'.codex/work/blog-enhance-20261014/QA/404-dog'));
const delta={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
const arrows={up:'ArrowUp',right:'ArrowRight',down:'ArrowDown',left:'ArrowLeft'};
const wasd={up:'w',right:'d',down:'s',left:'a'};
function route(map,start,target){
 const walls=new Set(map.walls),queue=[[start,[]]],seen=new Set([start.join(',')]);
 while(queue.length){const [point,steps]=queue.shift();if(point[0]===target[0]&&point[1]===target[1])return steps;
  for(const [direction,[dx,dy]]of Object.entries(delta)){const next=[point[0]+dx,point[1]+dy],key=next.join(',');
   if(next[0]<0||next[1]<0||next[0]>=map.columns||next[1]>=map.rows||walls.has(key)||seen.has(key))continue;
   seen.add(key);queue.push([next,steps.concat(direction)]);
  }
 }return null;
}
function validateMap(map){
 assert([7,9].includes(map.columns)&&map.rows===5,'Wrong map dimensions');
 assert.equal(map.fragments.length,3,'Exactly three fragments are required');
 assert.equal(new Set(map.fragments.map(p=>p.join(','))).size,3,'Duplicate fragment coordinates');
 for(const point of [map.start,...map.fragments]){
  assert(point[0]>=0&&point[1]>=0&&point[0]<map.columns&&point[1]<map.rows,'Map endpoint is outside bounds');
  assert(!map.walls.includes(point.join(',')),'Map endpoint is inside an obstacle');
  assert(route(map,map.start,point)!==null,'A reading fragment is unreachable');
 }
}
async function state(page){return page.locator('#dog-board').evaluate(e=>({x:+e.dataset.x,y:+e.dataset.y,found:+e.dataset.found,state:e.dataset.state}));}
async function step(page,direction,mode='arrows'){
 if(mode==='buttons')await page.locator(`[data-dog-move="${direction}"]`).click();
 else{await page.locator('#dog-board').focus();await page.keyboard.press((mode==='wasd'?wasd:arrows)[direction]);}
}
async function walk(page,map,target,mode){const here=await state(page),steps=route(map,[here.x,here.y],target);assert(steps,'No legal route to test target');for(const direction of steps)await step(page,direction,mode);}
async function finish(page,map,mode){for(const point of map.fragments)await walk(page,map,point,mode);assert.equal((await state(page)).state,'won');assert.equal((await state(page)).found,3);assert(await page.locator('#dog-result').isVisible());}
(async()=>{
 await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});const results=[],errors=[];
 try{
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
   page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(t=>localStorage.setItem('pref-theme',t),theme);
   await page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});await page.waitForSelector('.dog-not-found.is-playable');await page.evaluate(()=>document.fonts.ready);
   const map=JSON.parse(await page.locator('#dog-map').textContent()),archive=JSON.parse(await page.locator('#dog-archive').textContent());validateMap(map);
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   const layout=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,board:document.querySelector('#dog-board').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('[data-dog-move]')].map(e=>e.getBoundingClientRect().toJSON())}));
   assert(layout.documentWidth<=width+1,'Game page overflows horizontally');assert(layout.board.left>=0&&layout.board.right<=width,'Map is clipped');assert(layout.buttons.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=width),'Touch controls are undersized/clipped');
   assert.equal((await state(page)).state,'ready');assert(await page.locator('#dog-start').isVisible());assert(await page.locator('#dog-skip').isVisible());
   await page.screenshot({path:path.join(output,`${width}-${theme}-ready.png`),fullPage:true});
   await page.locator('#dog-start').click();assert.deepEqual(await state(page),{x:map.start[0],y:map.start[1],found:0,state:'playing'});
   await step(page,'left');assert.deepEqual(await state(page),{x:0,y:2,found:0,state:'playing'},'Map boundary can be crossed');
   await walk(page,map,[1,1],'arrows');const beforeWall=await state(page);await step(page,'right');assert.deepEqual(await state(page),beforeWall,'Obstacle can be crossed');
   await page.locator('#dog-start').click();await walk(page,map,map.fragments[0],'wasd');assert.equal((await state(page)).found,1);
   await step(page,'left');await step(page,'right');assert.equal((await state(page)).found,1,'Revisiting a fragment inflated score');
   await page.locator('#dog-start').click();assert.equal(await page.locator('.dog-fragment:not([hidden])').count(),3,'Reset did not restore fragments');
   await finish(page,map,width===390?'buttons':'wasd');
   assert.equal(await page.locator('.dog-fragment:not([hidden])').count(),0,'Collected star is still drawn');
   const href=await page.locator('#dog-result-link').getAttribute('href');assert(archive.some(p=>p.url===href),'Result is not a real post');assert.equal((await page.request.get(new URL(href,base).href)).status(),200);
   assert.equal(await page.locator('.dog-not-found').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'Reduced-motion game animates');
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(output,`${width}-${theme}-won.png`),fullPage:true});
   await page.locator('#dog-start').click();await finish(page,map,'buttons');assert.equal((await state(page)).found,3,'Second game cannot be completed');
   // Capture after propagation: the game must never consume outside input keys.
   await page.evaluate(()=>document.addEventListener('keydown',e=>{window.__dogLastPrevented=e.defaultPrevented;}));
   await page.locator('#dog-query').fill('wasd');await page.locator('#dog-query').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>window.__dogLastPrevented),false,'Game hijacked the search input');
   await page.locator('#dog-query').press('w');assert.equal(await page.evaluate(()=>window.__dogLastPrevented),false);
   await page.locator('body').click({position:{x:4,y:4}});await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>window.__dogLastPrevented),false,'Game hijacked whole-page arrows');
   await page.locator('#dog-query').fill('拓扑 安全');await Promise.all([page.waitForURL(u=>u.pathname==='/search/'),page.locator('.dog-search button').click()]);assert.equal(new URL(page.url()).searchParams.get('q'),'拓扑 安全');
   await page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});await Promise.all([page.waitForURL(u=>u.pathname.startsWith('/posts/')),page.locator('#dog-skip').click()]);assert(archive.some(p=>new URL(p.url,base).pathname===new URL(page.url()).pathname));
   const blocked=structuredClone(map);blocked.walls.push('0,0','1,1');assert.throws(()=>validateMap(blocked),/unreachable/,'Disconnected-fragment negative fixture passed');
   results.push({width,theme,rows:map.rows,columns:map.columns,reachable:true,keyboard:true,touch:true,boundary:true,obstacles:true,revisit:true,replay:true,inputNotCaptured:true,realResult:true,...layout});await page.close();
  }
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:1000},javaScriptEnabled:false,colorScheme:theme});await page.goto(base+'/404.html');await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('#dog-fallback a').count(),3);assert(await page.locator('#dog-fallback').isVisible());assert.equal(await page.locator('#dog-controls:visible').count(),0);assert(await page.locator('.dog-exits').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(output,`${width}-${theme}-no-js.png`),fullPage:true});await page.locator('#dog-query').fill('研究');await Promise.all([page.waitForURL(u=>u.pathname==='/search/'),page.locator('.dog-search button').click()]);assert.equal(new URL(page.url()).searchParams.get('q'),'研究');await page.close();
  }
  const motion=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});await motion.goto(base+'/404.html');await motion.waitForSelector('.dog-not-found.is-playable');await motion.locator('#dog-start').click();
  // Stretch only this browser fixture to 10s, so natural completion cannot mask
  // a missing preference-change cancellation handler. Media events are async.
  await motion.locator('#dog-hop').evaluate(e=>{e.__nativeAnimate=e.animate;e.animate=function(k,o){return this.__nativeAnimate(k,{...o,duration:10000});};});
  await step(motion,'right');assert(await motion.locator('#dog-hop').evaluate(e=>e.getAnimations().some(a=>a.playState==='running')),'Normal move has no step animation');await motion.emulateMedia({reducedMotion:'reduce'});
  await motion.waitForFunction(()=>document.querySelector('.dog-not-found').getAnimations({subtree:true}).every(a=>a.playState!=='running'),null,{timeout:1000});
  await motion.locator('#dog-hop').evaluate(e=>{e.animate=e.__nativeAnimate;delete e.__nativeAnimate;});
  await motion.emulateMedia({reducedMotion:'no-preference'});await step(motion,'right');await motion.waitForTimeout(550);assert.equal(await motion.locator('.dog-not-found').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'Idle game has a perpetual animation');
  await motion.goto(base+'/');assert.equal(await motion.locator('link[href*="not-found"]').count(),0);await motion.close();assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,noJS:true,finiteMotion:true,reducedChange:true,disconnectedNegativeRejected:true,pageErrors:errors},null,2));
  console.log('PASS: 404 dog game; 4 viewport/theme + 4 no-JS cases; reachable map, keyboard/buttons, collisions, repeat collection, replay, real article/skip/search routes, input isolation, finite/reduced motion, disconnected-map negative.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
