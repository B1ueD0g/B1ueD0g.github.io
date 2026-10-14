(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BlueDogTrail = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const COLUMNS = 7, ROWS = 5, SIZE = COLUMNS * ROWS;
  const MAX_ATTEMPTS = 32;
  const DIRECTIONS = ["up", "right", "down", "left"];
  const DELTAS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const key = point => point[0] + "," + point[1];
  const number = point => point[1] * COLUMNS + point[0];
  const point = value => [value % COLUMNS, Math.floor(value / COLUMNS)];
  const isPoint = value => Array.isArray(value) && value.length === 2 &&
    Number.isInteger(value[0]) && Number.isInteger(value[1]) &&
    value[0] >= 0 && value[0] < COLUMNS && value[1] >= 0 && value[1] < ROWS;
  const validMode = mode => mode === "free" || mode === "challenge";
  const margin = level => Math.max(4, 9 - level);

  function randomFor(seed) {
    let value = 2166136261;
    for (let index = 0; index < seed.length; index++) value = Math.imul(value ^ seed.charCodeAt(index), 16777619);
    return function () {
      value = (value + 0x6D2B79F5) | 0;
      let mixed = Math.imul(value ^ value >>> 15, 1 | value);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffled(values, random) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function basicMap(map) {
    if (!map || typeof map.seed !== "string" || !Number.isSafeInteger(map.level) || map.level < 1 ||
        !validMode(map.mode) || map.columns !== COLUMNS || map.rows !== ROWS ||
        map.originX !== 104 || map.originY !== 88 || map.stepX !== 72 || map.stepY !== 56 ||
        !Array.isArray(map.walls) || !Array.isArray(map.stars) || map.stars.length !== 3 ||
        !Array.isArray(map.portals) || map.portals.length !== 2) throw new Error("Malformed island map");
    const walls = new Set();
    map.walls.forEach(wall => {
      if (typeof wall !== "string" || !/^[0-6],[0-4]$/.test(wall) || walls.has(wall)) throw new Error("Invalid island wall");
      walls.add(wall);
    });
    const objects = [map.start, map.mailbox, ...map.stars, map.bone, ...map.portals];
    const occupied = new Set();
    objects.forEach(location => {
      if (!isPoint(location) || walls.has(key(location)) || occupied.has(key(location))) throw new Error("Invalid island object");
      occupied.add(key(location));
    });
    return map;
  }

  function context(map) {
    const walls = new Set(map.walls);
    const portals = new Map([[number(map.portals[0]), number(map.portals[1])], [number(map.portals[1]), number(map.portals[0])]]);
    const stars = new Map(map.stars.map((location, index) => [number(location), 1 << index]));
    const graph = Array.from({ length: SIZE }, () => []);
    const reverse = Array.from({ length: SIZE }, () => []);
    const cells = [];
    for (let location = 0; location < SIZE; location++) {
      const [x, y] = point(location);
      if (walls.has(x + "," + y)) continue;
      cells.push(location);
      DIRECTIONS.forEach(direction => {
        const [dx, dy] = DELTAS[direction], nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= COLUMNS || ny < 0 || ny >= ROWS || walls.has(nx + "," + ny)) return;
        const entry = ny * COLUMNS + nx;
        const destination = portals.has(entry) ? portals.get(entry) : entry;
        graph[location].push({ direction, entry, destination, portal: portals.has(entry) });
        reverse[destination].push(location);
      });
    }
    return { walls, stars, graph, reverse, cells, mailbox: number(map.mailbox), bone: number(map.bone) };
  }

  function distances(ctx, start, backwards) {
    const distance = new Map([[start, 0]]), queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      const next = backwards ? ctx.reverse[current] : ctx.graph[current].map(edge => edge.destination);
      next.forEach(destination => {
        if (!distance.has(destination)) {
          distance.set(destination, distance.get(current) + 1);
          queue.push(destination);
        }
      });
    }
    return distance;
  }

  function connected(ctx, start) {
    return distances(ctx, start, false).size === ctx.cells.length && distances(ctx, start, true).size === ctx.cells.length;
  }

  function shortest(ctx, start, collected, includeBone = false) {
    let mask = 0;
    collected.forEach(location => {
      const index = typeof location === "string" ? number(location.split(",").map(Number)) : number(location);
      mask |= ctx.stars.get(index) || 0;
      if (includeBone && index === ctx.bone) mask |= 8;
    });
    const initial = mask * SIZE + start, queue = [initial], previous = new Map([[initial, null]]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor], position = current % SIZE, found = Math.floor(current / SIZE);
      if (position === ctx.mailbox && found === (includeBone ? 15 : 7)) {
        const route = [];
        let end = current;
        while (previous.get(end)) {
          const link = previous.get(end);
          route.push(link.direction); end = link.parent;
        }
        return route.reverse();
      }
      ctx.graph[position].forEach(edge => {
        const nextMask = found | (ctx.stars.get(edge.destination) || 0) | (includeBone && edge.destination === ctx.bone ? 8 : 0);
        // Delivery is terminal: a route cannot cross a completed mailbox to collect the bone later.
        if (includeBone && edge.destination === ctx.mailbox && (nextMask & 7) === 7 && nextMask !== 15) return;
        const next = nextMask * SIZE + edge.destination;
        if (!previous.has(next)) {
          previous.set(next, { parent: current, direction: edge.direction }); queue.push(next);
        }
      });
    }
    return null;
  }

  function solve(map, state) {
    basicMap(map);
    if (state && state.phase === "lost") return null;
    const location = state ? [state.x, state.y] : map.start;
    if (!isPoint(location) || map.walls.includes(key(location))) throw new Error("Invalid player location");
    // Route length models movement/star collection; optional bone never sets the initial budget.
    return shortest(context(map), number(location), state ? state.collected : []);
  }

  function validateMap(map) {
    basicMap(map);
    const ctx = context(map);
    if (!connected(ctx, number(map.start))) throw new Error("Island portal graph is not strongly connected");
    const route = shortest(ctx, number(map.start), []);
    if (!route || !shortest(ctx, number(map.start), [], true) || !Number.isSafeInteger(map.optimalMoves) || map.optimalMoves !== route.length ||
        !Number.isSafeInteger(map.budget) || map.budget !== route.length + margin(map.level)) throw new Error("Invalid island route or budget");
    return true;
  }

  function finishMap(map) {
    const ctx = context(map);
    if (!connected(ctx, number(map.start))) return null;
    const route = shortest(ctx, number(map.start), []);
    if (!route || !shortest(ctx, number(map.start), [], true)) return null;
    map.optimalMoves = route.length;
    map.budget = route.length + margin(map.level);
    return map;
  }

  function fallback(seed, level, mode, wallCount) {
    // Deterministic legal fallback; MAX_ATTEMPTS=0 in a VM can exercise this production branch.
    return finishMap({ seed, level, mode, columns: COLUMNS, rows: ROWS,
      walls: ["1,1", "3,1", "5,1", "1,3", "3,3", "5,3", "2,0", "4,4", "0,4", "6,0"].slice(0, wallCount),
      start: [0, 2], mailbox: [6, 2], stars: [[1, 0], [3, 2], [5, 4]], bone: [3, 4],
      portals: [[0, 0], [6, 4]], originX: 104, originY: 88, stepX: 72, stepY: 56 });
  }

  function createMap(seed, { level = 1, mode = "free" } = {}) {
    if (!Number.isSafeInteger(level) || level < 1 || !validMode(mode)) throw new Error("Invalid island options");
    const label = String(seed), random = randomFor(label + ":" + level + ":" + mode);
    const wallCount = Math.min(10, 5 + level);
    const all = Array.from({ length: SIZE }, (_, index) => index);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const order = shuffled(all, random), walls = order.slice(0, wallCount).map(value => key(point(value)));
      const floor = order.slice(wallCount), first = floor[0];
      const separation = value => Math.abs(value % COLUMNS - first % COLUMNS) + Math.abs(Math.floor(value / COLUMNS) - Math.floor(first / COLUMNS));
      const other = floor.slice(1).sort((a, b) => separation(b) - separation(a))[0];
      const available = floor.filter(value => value !== first && value !== other);
      const start = available.shift();
      const map = { seed: label, level, mode, columns: COLUMNS, rows: ROWS, walls,
        start: point(start), mailbox: point(available[0]), stars: available.slice(1, 4).map(point), bone: point(available[4]),
        portals: [point(first), point(other)], originX: 104, originY: 88, stepX: 72, stepY: 56 };
      const ctx = context(map);
      if (!connected(ctx, start)) continue;
      const fromStart = distances(ctx, start, false);
      available.sort((a, b) => fromStart.get(b) - fromStart.get(a));
      map.mailbox = point(available[0]);
      const remaining = shuffled(available.slice(1), random);
      map.stars = remaining.slice(0, 3).map(point); map.bone = point(remaining[3]);
      const result = finishMap(map);
      if (result) return result;
    }
    const result = fallback(label, level, mode, wallCount);
    if (!result) throw new Error("Could not create a playable island");
    return result;
  }

  function createState(map, mode = map.mode) {
    basicMap(map);
    if (!validMode(mode)) throw new Error("Invalid game mode");
    return { x: map.start[0], y: map.start[1], phase: "playing", collected: [], boneCollected: false,
      moves: 0, remaining: mode === "challenge" ? map.budget : null, score: 0, portalJumps: 0, mode, delivered: false };
  }

  function step(map, state, direction) {
    if (state.phase !== "playing") return { state, events: [], moved: false };
    if (!Object.prototype.hasOwnProperty.call(DELTAS, direction)) return { state, events: [{ type: "blocked", reason: "direction" }], moved: false };
    const ctx = context(map), current = number([state.x, state.y]);
    const edge = ctx.graph[current].find(candidate => candidate.direction === direction);
    if (!edge) return { state, events: [{ type: "blocked", reason: "edge-or-bush" }], moved: false };
    const destination = point(edge.destination), collected = state.collected.slice();
    const next = { ...state, x: destination[0], y: destination[1], collected, moves: state.moves + 1,
      remaining: state.mode === "challenge" ? Math.max(0, state.remaining - 1) : null };
    const events = [{ type: "walk", from: [state.x, state.y], to: point(edge.entry) }];
    if (edge.portal) { next.portalJumps++; events.push({ type: "portal", from: point(edge.entry), to: destination.slice() }); }
    const location = key(destination);
    if (ctx.stars.has(edge.destination) && !collected.includes(location)) {
      collected.push(location); next.score += 100; events.push({ type: "star", count: collected.length });
    }
    if (location === key(map.bone) && !state.boneCollected) {
      next.boneCollected = true; next.score += 50;
      if (state.mode === "challenge") next.remaining += 3;
      events.push({ type: "bone" });
    }
    if (edge.destination === ctx.mailbox) {
      if (collected.length === 3) {
        next.phase = "won"; next.delivered = true;
        next.score += 100 + (state.mode === "challenge" ? next.remaining * 10 : Math.max(0, 40 - next.moves) * 5);
        events.push({ type: "win" });
      } else events.push({ type: "mailbox-needs-stars", count: collected.length });
    }
    if (next.phase !== "won" && state.mode === "challenge" && next.remaining === 0) {
      next.phase = "lost"; events.push({ type: "lose" });
    }
    return { state: next, events, moved: true };
  }

  return Object.freeze({ createMap, createState, step, solve, validateMap });
});
