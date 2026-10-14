// Exercise the real UMD engine. The graph oracle below is independent of its solver.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const enginePath = path.resolve(__dirname, '../assets/js/not-found-engine.js');
const engine = require(enginePath);
const directions = {up:[0,-1], right:[1,0], down:[0,1], left:[-1,0]};
const coordinate = point => point.join(',');
const clone = value => JSON.parse(JSON.stringify(value));

function independentRoute(map, current, target, includeBone=false) {
  const walls = new Set(map.walls), stars = new Map(map.stars.map((point, index) => [coordinate(point), 1 << index]));
  if (includeBone) stars.set(coordinate(map.bone),8);
  const portals = new Map([[coordinate(map.portals[0]), map.portals[1]], [coordinate(map.portals[1]), map.portals[0]]]);
  let mask = 0;
  for (const point of current?.collected || []) mask |= stars.get(point) || 0;
  if (includeBone && current?.boneCollected) mask |= 8;
  const origin = current ? [current.x, current.y] : map.start;
  const queue = [{point:origin, mask, route:[]}], seen = new Set([`${coordinate(origin)}|${mask}`]);
  for (let head = 0; head < queue.length; head++) {
    const item = queue[head];
    if (target ? coordinate(item.point) === coordinate(target) : item.mask === (includeBone?15:7) && coordinate(item.point) === coordinate(map.mailbox)) return item.route;
    if ((item.mask & 7) === 7 && coordinate(item.point) === coordinate(map.mailbox)) continue;
    for (const [direction, [dx,dy]] of Object.entries(directions)) {
      let point = [item.point[0] + dx, item.point[1] + dy];
      if (point[0] < 0 || point[1] < 0 || point[0] >= map.columns || point[1] >= map.rows || walls.has(coordinate(point))) continue;
      point = portals.get(coordinate(point)) || point; // Exactly one portal transition per successful move.
      const nextMask = item.mask | (stars.get(coordinate(point)) || 0), key = `${coordinate(point)}|${nextMask}`;
      if (seen.has(key)) continue;
      seen.add(key); queue.push({point, mask:nextMask, route:item.route.concat(direction)});
    }
  }
  return null;
}

function validateIndependently(map) {
  assert.equal(map.columns, 7); assert.equal(map.rows, 5);
  assert(['free','challenge'].includes(map.mode));
  assert.equal(typeof map.seed, 'string'); assert(Number.isInteger(map.level) && map.level >= 1);
  assert.deepEqual([map.originX,map.originY,map.stepX,map.stepY], [104,88,72,56]);
  assert.equal(map.stars.length, 3); assert.equal(map.portals.length, 2);
  const inBounds = point => Array.isArray(point) && point.length === 2 && point.every(Number.isInteger) && point[0] >= 0 && point[1] >= 0 && point[0] < 7 && point[1] < 5;
  const walls = new Set(map.walls);
  assert.equal(walls.size, map.walls.length, 'Duplicate wall');
  for (const wall of walls) assert(inBounds(wall.split(',').map(Number)), 'Wall outside the grid');
  const objects = [map.start,map.mailbox,...map.stars,map.bone,...map.portals];
  assert(objects.every(inBounds), 'Object outside the grid');
  assert.equal(new Set(objects.map(coordinate)).size, objects.length, 'Objects overlap');
  assert(objects.every(point => !walls.has(coordinate(point))), 'Object inside a wall');
  const route = independentRoute(map);
  assert(route, 'Actual portal graph cannot collect all stars and deliver');
  assert(independentRoute(map, null, map.bone), 'Optional bone is unreachable in the actual portal graph');
  assert(independentRoute(map, null, null, true), 'Taking the optional bone prevents later delivery');
  assert.equal(map.optimalMoves, route.length, 'Production optimum disagrees with independent BFS');
  if (map.mode === 'challenge') assert.equal(map.budget, route.length + Math.max(4, 9-map.level), 'Challenge budget changed');
  assert(map.budget >= route.length, 'Initial budget requires an optional bone');
  return route;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {Object.freeze(value); Object.values(value).forEach(freeze);}
  return value;
}

function takeStep(map, state, direction) {
  const beforeMap = clone(map), beforeState = clone(state);
  freeze(map); freeze(state);
  const result = engine.step(map, state, direction);
  // Maps/states are JSON data; normalize VM realm prototypes without discarding data comparisons.
  assert.deepEqual(clone(map), beforeMap, 'step mutated its map');
  assert.deepEqual(clone(state), beforeState, 'step mutated its input state');
  assert(Array.isArray(result.events) && typeof result.moved === 'boolean');
  return result;
}

function walk(map, state, route) {
  const events = [];
  for (const direction of route) {const result = takeStep(map,state,direction); state=result.state; events.push(...result.events);}
  return {state,events};
}

function fixture(mode='free') {
  const map = {seed:'explicit-rule-fixture', level:1, mode, columns:7, rows:5,
    walls:['2,0','3,0','4,0','2,1','3,1','4,1'], start:[0,2], mailbox:[6,2], stars:[[1,2],[3,2],[5,2]],
    bone:[0,3], portals:[[1,4],[5,4]], originX:104, originY:88, stepX:72, stepY:56};
  map.optimalMoves = independentRoute(map).length; map.budget = map.optimalMoves + 8;
  return map;
}

for (const name of ['createMap','createState','step','solve','validateMap']) assert.equal(typeof engine[name], 'function', `Missing UMD export ${name}`);
const layouts = new Set(), wallLayouts = new Set(), placements = new Set();
let generated = 0;
for (let index=0; index<128; index++) for (const mode of ['free','challenge']) {
  const seed = `independent-trail-${index}`, level = [1,2,4,8,12][index % 5];
  const map = engine.createMap(seed,{level,mode});
  assert.deepEqual(map, engine.createMap(seed,{level,mode}), 'Same seed/options must be deterministic');
  assert.equal(map.seed,seed); assert.equal(map.level,level); assert.equal(map.mode,mode);
  assert(map.walls.length >= 6 && map.walls.length <= 10, 'Wall difficulty outside its bounded range');
  if (level === 1) assert.equal(map.walls.length,6);
  const route = validateIndependently(map); assert.equal(engine.validateMap(map),true);
  const advertised = engine.solve(map); assert(Array.isArray(advertised)); assert.equal(advertised.length,route.length);
  const solved = walk(map,engine.createState(map),advertised).state;
  assert.equal(solved.phase,'won'); assert.equal(solved.delivered,true); assert.equal(solved.collected.length,3);
  assert(solved.score >= 400 && Number.isSafeInteger(solved.score));
  if (mode==='challenge') assert(solved.remaining >= 0);
  const partial = walk(map,engine.createState(map),route.slice(0,Math.floor(route.length/2))).state;
  const independentRemainder = independentRoute(map,partial), productionRemainder = engine.solve(map,partial);
  assert(Array.isArray(productionRemainder)); assert.equal(productionRemainder.length,independentRemainder.length,'Partial-state solver is not shortest');
  assert.equal(walk(map,partial,productionRemainder).state.phase,'won');
  const boneRoute = independentRoute(map,null,map.bone), pickedBone = walk(map,engine.createState(map,'free'),boneRoute);
  assert.equal(pickedBone.state.boneCollected,true); assert.equal(pickedBone.events.filter(event=>event.type==='bone').length,1);
  const withBonus = walk(map,engine.createState(map,'free'),independentRoute(map,null,null,true)).state;
  assert.equal(withBonus.phase,'won'); assert.equal(withBonus.boneCollected,true);
  const walls = [...map.walls].sort();
  const objects = {start:map.start,mailbox:map.mailbox,stars:map.stars,bone:map.bone,portals:map.portals};
  wallLayouts.add(JSON.stringify(walls)); placements.add(JSON.stringify(objects)); layouts.add(JSON.stringify({walls,...objects})); generated++;
}
assert(layouts.size >= 120, 'Seed changes do not produce enough genuinely different islands');
assert(wallLayouts.size >= 100, 'Obstacle layouts barely vary across 128 seeds');
assert(placements.size >= 120, 'Entity placements barely vary across 128 seeds');

for (const mode of ['free','challenge']) {
  const map = fixture(mode); validateIndependently(map); assert.equal(engine.validateMap(map),true);
  const initial = engine.createState(map); assert.equal(initial.phase,'playing'); assert.equal(initial.mode,mode);
  assert.deepEqual([initial.x,initial.y],map.start); assert.equal(initial.moves,0); assert.equal(initial.score,0);
  assert.equal(initial.boneCollected,false); assert.equal(initial.delivered,false); assert.equal(initial.portalJumps,0); assert.deepEqual(initial.collected,[]);
  assert.equal(initial.remaining,mode==='challenge'?map.budget:null);
  const blocked = takeStep(map,initial,'left'); assert.equal(blocked.moved,false); assert.deepEqual(blocked.state,initial);
  assert(blocked.events.some(event=>event.type==='blocked'));
  const invalid = takeStep(map,initial,'diagonal'); assert.equal(invalid.moved,false); assert.deepEqual(invalid.state,initial);
  const atWall = {...clone(initial),x:1,y:1}; const bush = takeStep(map,atWall,'right'); assert.equal(bush.moved,false); assert.deepEqual(bush.state,atWall);

  const portalState = {...clone(initial),x:0,y:4};
  const portal = takeStep(map,portalState,'right'); assert.equal(portal.moved,true); assert.deepEqual([portal.state.x,portal.state.y],[5,4]);
  assert.equal(portal.state.moves,1); assert.equal(portal.state.portalJumps,1); assert.equal(portal.events.filter(event=>event.type==='portal').length,1);
  const portalEvent = portal.events.find(event=>event.type==='portal'); assert.deepEqual(portalEvent.from,[1,4]); assert.deepEqual(portalEvent.to,[5,4]);
  if (mode==='challenge') assert.equal(portal.state.remaining,map.budget-1);
  const portalAgain = walk(map,portal.state,['left','right']).state; assert.deepEqual([portalAgain.x,portalAgain.y],[1,4]); assert.equal(portalAgain.portalJumps,2);

  const bone = takeStep(map,initial,'down'); assert.equal(bone.state.boneCollected,true); assert.equal(bone.state.score,50); assert.equal(bone.events.filter(event=>event.type==='bone').length,1);
  if (mode==='challenge') assert.equal(bone.state.remaining,map.budget+2);
  const boneAgain = walk(map,bone.state,['up','down']); assert.equal(boneAgain.state.score,50); assert.equal(boneAgain.events.filter(event=>event.type==='bone').length,0);
  if (mode==='challenge') assert.equal(boneAgain.state.remaining,map.budget);
  const star = takeStep(map,initial,'right'); assert.equal(star.state.score,100); assert.equal(star.state.collected.length,1);
  const starAgain = walk(map,star.state,['left','right']); assert.equal(starAgain.state.score,100); assert.equal(starAgain.state.collected.length,1); assert.equal(starAgain.events.filter(event=>event.type==='star').length,0);

  const earlyMailbox = walk(map,initial,['down','right','right','right','right','right','right','up']);
  assert.equal(earlyMailbox.state.phase,'playing'); assert.equal(earlyMailbox.state.delivered,false); assert.equal(earlyMailbox.state.collected.length,0); assert(earlyMailbox.events.some(event=>event.type==='mailbox-needs-stars'));
  const threeStars = walk(map,initial,Array(5).fill('right')); assert.equal(threeStars.state.collected.length,3); assert.equal(threeStars.state.phase,'playing'); assert.equal(threeStars.state.delivered,false); assert.equal(threeStars.state.score,300);
  const victory = takeStep(map,threeStars.state,'right'); assert.equal(victory.state.phase,'won'); assert.equal(victory.state.delivered,true); assert(victory.events.some(event=>event.type==='win'));
  const efficiency = mode==='challenge'?victory.state.remaining*10:Math.max(0,40-victory.state.moves)*5;
  assert.equal(victory.state.score,400+efficiency);
  const terminal = takeStep(map,victory.state,'left'); assert.equal(terminal.moved,false); assert.deepEqual(terminal.state,victory.state);
}

const challenge = fixture('challenge'), challengeInitial = engine.createState(challenge);
const lastMove = {...clone(challengeInitial),x:5,y:2,collected:challenge.stars.map(coordinate),moves:challenge.budget-1,remaining:1,score:300};
const lastWin = takeStep(challenge,lastMove,'right'); assert.equal(lastWin.state.phase,'won'); assert.equal(lastWin.state.remaining,0); assert.equal(lastWin.state.score,400); assert.equal(lastWin.state.delivered,true);
const lastLose = takeStep(challenge,{...clone(challengeInitial),remaining:1,moves:challenge.budget-1},'right'); assert.equal(lastLose.state.phase,'lost'); assert.equal(lastLose.state.remaining,0); assert.equal(lastLose.state.delivered,false); assert(lastLose.events.some(event=>event.type==='lose'));
assert.deepEqual(takeStep(challenge,lastLose.state,'left').state,lastLose.state);
const duplicate = clone(challenge); duplicate.stars[1]=duplicate.stars[0]; assert.throws(()=>engine.validateMap(duplicate),'Duplicate entity fixture accepted');
const blockedStart = clone(challenge); blockedStart.walls.push(coordinate(blockedStart.start)); assert.throws(()=>engine.validateMap(blockedStart),'Wall on start fixture accepted');
const disconnected = clone(challenge); disconnected.walls=['5,1','6,0','6,2']; disconnected.stars[2]=[6,1]; disconnected.mailbox=[6,3];
assert.equal(independentRoute(disconnected),null,'Unreachable negative fixture itself is wrong');
assert.throws(()=>engine.validateMap(disconnected),'Unreachable fixture accepted'); assert.equal(engine.solve(disconnected),null,'Solver claims a route through an unreachable target');
const malformed = clone(challenge); malformed.portals=[[1,4],[99,99]]; assert.throws(()=>engine.validateMap(malformed),'Out-of-grid portal accepted');
const earlyDelivery = {...fixture(),walls:['0,1','1,1','2,1','3,1','4,1','5,1'],start:[0,0],mailbox:[4,0],stars:[[1,0],[2,0],[3,0]],bone:[5,0],portals:[[0,2],[6,4]]};
earlyDelivery.optimalMoves=independentRoute(earlyDelivery).length; earlyDelivery.budget=earlyDelivery.optimalMoves+8;
assert.equal(independentRoute(earlyDelivery,null,null,true),null,'Early-delivery bonus trap fixture itself is wrong');
assert.throws(()=>engine.validateMap(earlyDelivery),'Strongly connected map with a terminal bonus trap was accepted');
const invalidBudget=clone(challenge);invalidBudget.budget--;assert.throws(()=>engine.validateMap(invalidBudget),'Incorrect challenge budget accepted');
const source=fs.readFileSync(enginePath,'utf8');
const executableSource=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
assert(!/\b(?:document|localStorage|sessionStorage|fetch|XMLHttpRequest|requestAnimationFrame|setInterval|setTimeout|Date|performance)\b/.test(executableSource),'Pure engine acquired a DOM/storage/clock/timer/network dependency');
// Exercise the real bounded-retry fallback branch by changing its retry count only.
assert.equal((source.match(/const MAX_ATTEMPTS = 32;/g)||[]).length,1,'Fallback test seam moved; review before updating this instrumentation');
const sandbox={module:{exports:{}}};vm.runInNewContext(source.replace('const MAX_ATTEMPTS = 32;','const MAX_ATTEMPTS = 0;'),sandbox,{filename:enginePath,timeout:1000});
for(const mode of ['free','challenge'])for(const level of [1,2,4,8,12]){
  const map=sandbox.module.exports.createMap(`forced-fallback-${mode}-${level}`,{mode,level});
  validateIndependently(map);assert.equal(sandbox.module.exports.validateMap(map),true);
  const state=walk(map,sandbox.module.exports.createState(map),independentRoute(map)).state;assert.equal(state.phase,'won');
  assert.equal(walk(map,sandbox.module.exports.createState(map,'free'),independentRoute(map,null,null,true)).state.boneCollected,true);
}
const browserGlobal={};vm.runInNewContext(source,browserGlobal,{filename:enginePath,timeout:1000});
assert.equal(typeof browserGlobal.BlueDogTrail?.createMap,'function','Browser UMD export is missing');
assert.equal(Object.isFrozen(browserGlobal.BlueDogTrail),true);
console.log(`PASS: real UMD 404 engine; ${generated} generated maps / 128 seeds; ${layouts.size} distinct layouts, ${wallLayouts.size} wall patterns, ${placements.size} placements; independent portal/bonus BFS, budgets, partial solver, immutable rules, once-only bonuses, delivery, terminal states, forced production fallback and negative fixtures.`);
