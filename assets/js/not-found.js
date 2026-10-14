(() => {
  "use strict";
  const root = document.querySelector(".dog-not-found"), engine = globalThis.BlueDogTrail;
  if (!root || !engine) return;
  const ids = ["board", "controls", "player", "drawing", "hop", "burst", "status", "start", "shuffle", "next", "result", "result-heading", "result-link", "tiles", "items", "mailbox", "count", "score", "best", "budget", "level", "modes", "fallback", "skip", "map", "archive"];
  const nodes = Object.fromEntries(ids.map(id => [id, document.getElementById("dog-" + id)]));
  if (ids.some(id => !nodes[id])) return;
  const directions = [...root.querySelectorAll("[data-dog-move]")];
  const modeButtons = [...root.querySelectorAll("[data-dog-mode]")];
  const scoreStars = [...root.querySelectorAll("[data-score-star]")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const storageKey = "bluedog-trail-best-v2", best = { free: 0, challenge: 0 };
  const namespace = "http://www.w3.org/2000/svg";
  const keys = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left", w: "up", d: "right", s: "down", a: "left" };
  let archive, map, state, mode = "free", level = 1, ready = true, seedCount = 0;
  let hopAnimation = null, burstAnimation = null;

  const cancelMotion = () => {
    if (hopAnimation) hopAnimation.cancel();
    if (burstAnimation) burstAnimation.cancel();
    hopAnimation = burstAnimation = null;
  };
  const fail = () => {
    cancelMotion();
    nodes.controls.hidden = true; nodes.modes.hidden = true; nodes.next.hidden = true;
    nodes.fallback.hidden = false; root.classList.remove("is-playable");
    directions.forEach(button => { button.disabled = true; });
    nodes.status.textContent = "小狗先休息一下，你仍可搜索文章，或沿着下面的文章继续走。";
  };
  const safely = action => (...args) => { try { action(...args); } catch (_) { fail(); } };
  const article = () => archive[Math.floor(Math.random() * archive.length)];
  const cellKey = location => location[0] + "," + location[1];
  const coordinates = location => [map.originX + location[0] * map.stepX, map.originY + location[1] * map.stepY];
  const transform = location => "translate(" + coordinates(location).join(" ") + ")";
  const svg = (tag, attributes = {}, children = []) => {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    children.forEach(child => element.appendChild(child));
    return element;
  };
  const newSeed = () => {
    seedCount++;
    const entropy = new Uint32Array(2);
    try { globalThis.crypto.getRandomValues(entropy); }
    catch (_) { entropy[0] = Math.floor(Math.random() * 4294967296); entropy[1] = Date.now() >>> 0; }
    return entropy[0].toString(36) + "-" + entropy[1].toString(36) + "-" + seedCount;
  };
  const layout = value => JSON.stringify([value.walls, value.start, value.mailbox, value.stars, value.bone, value.portals]);
  const makeMap = () => {
    const previous = map && layout(map);
    for (let attempt = 0; attempt < 4; attempt++) {
      const candidate = engine.createMap(newSeed(), { level, mode });
      if (layout(candidate) !== previous) { map = candidate; return; }
    }
    throw new Error("Could not create a different island");
  };
  const readBest = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === "object") ["free", "challenge"].forEach(name => {
        if (Number.isSafeInteger(saved[name]) && saved[name] >= 0) best[name] = saved[name];
      });
    } catch (_) { /* The current session still keeps its best score. */ }
  };
  const saveBest = () => {
    if (state.score <= best[mode]) return;
    best[mode] = state.score;
    try { localStorage.setItem(storageKey, JSON.stringify(best)); } catch (_) { /* Session fallback. */ }
  };

  const drawMap = () => {
    const walls = new Set(map.walls), tiles = [];
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.columns; x++) {
      const location = [x, y], [cx, cy] = coordinates(location);
      if (walls.has(cellKey(location))) tiles.push(svg("g", { class: "dog-obstacle", transform: transform(location) }, [
        svg("ellipse", { cx: 0, cy: 10, rx: 25, ry: 12 }),
        svg("path", { d: "M-20 8Q-28-5-13-12q4-15 16-8 20-4 21 11 11 5 2 19Z" }),
        svg("path", { class: "dog-leaf-line", d: "M-5 8 3-11M1-3l-8-4M-1 2l11-4" })
      ]));
      else tiles.push(svg("rect", { class: "dog-path-tile", x: cx - 28, y: cy - 21, width: 56, height: 42, rx: 11 }));
    }
    nodes.tiles.replaceChildren(...tiles);
    const items = map.stars.map(location => svg("g", { class: "dog-fragment", "data-fragment": cellKey(location), transform: transform(location) }, [
      svg("ellipse", { cy: 15, rx: 13, ry: 4 }),
      svg("path", { d: "m0-18 5 10 11 2-8 8 2 12-10-6-10 6 2-12-8-8 11-2Z" })
    ]));
    items.push(svg("g", { class: "dog-bone", "data-bone": cellKey(map.bone), transform: transform(map.bone) }, [
      svg("ellipse", { class: "dog-bone-shadow", cy: 13, rx: 17, ry: 4 }),
      svg("path", { class: "dog-bone-shape", d: "M-10-5c-5-7-14-2-11 4-5 5 2 12 7 7L9-4c5 7 14 2 11-4 5-5-2-12-7-7Z" })
    ]));
    map.portals.forEach((location, index) => {
      const label = svg("text", { class: "dog-portal-label", "text-anchor": "middle", y: 7 });
      label.textContent = index === 0 ? "A" : "B";
      items.push(svg("g", { class: "dog-portal", "data-portal": cellKey(location), transform: transform(location) }, [
        svg("ellipse", { cy: 5, rx: 24, ry: 15 }), svg("ellipse", { cy: 5, rx: 18, ry: 10 }), label
      ]));
    });
    nodes.items.replaceChildren(...items);
    const [mx, my] = coordinates(map.mailbox);
    nodes.mailbox.setAttribute("transform", `translate(${mx + 4} ${my - 34})`);
    nodes.map.textContent = JSON.stringify(map);
  };

  const render = () => {
    const phase = ready ? "ready" : state.phase;
    nodes.player.setAttribute("transform", transform([state.x, state.y]));
    Object.assign(nodes.board.dataset, { x: String(state.x), y: String(state.y), found: String(state.collected.length),
      moves: String(state.moves), mode, phase, state: phase, score: String(state.score),
      remaining: state.remaining === null ? "" : String(state.remaining), portalJumps: String(state.portalJumps) });
    nodes.count.textContent = state.collected.length + " / 3";
    nodes.score.textContent = String(state.score); nodes.best.textContent = String(best[mode]);
    nodes.budget.textContent = mode === "challenge" ? "余 " + state.remaining + " 步" : "自由散步";
    nodes.level.textContent = String(level);
    scoreStars.forEach((star, index) => star.classList.toggle("is-found", index < state.collected.length));
    nodes.items.querySelectorAll("[data-fragment]").forEach(item => {
      item.toggleAttribute("hidden", state.collected.includes(item.dataset.fragment));
    });
    const bone = nodes.items.querySelector("[data-bone]");
    if (bone) bone.toggleAttribute("hidden", state.boneCollected);
    nodes.mailbox.classList.toggle("is-ready", state.collected.length === 3);
    directions.forEach(button => { button.disabled = phase !== "playing"; });
    modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.dogMode === mode)));
    nodes.next.hidden = phase !== "won";
    nodes.start.textContent = ready ? "开始散步 →" : phase === "playing" ? "重走本岛 ↺" : "再试本岛 ↺";
    nodes.board.setAttribute("aria-label", "小狗地图。" + (phase === "ready" ? "开始后" : "") + "用方向键或 W A S D 收集三颗星，再走到蓝色信箱。紫色 A、B 圆环可互相传送。骨头可加分。");
  };

  const animate = events => {
    cancelMotion();
    if (reduced.matches || document.hidden || !nodes.hop.animate) return;
    const portal = events.some(event => event.type === "portal");
    hopAnimation = nodes.hop.animate(portal ? [{ opacity: .25, transform: "translateY(0)" }, { opacity: 1, transform: "translateY(-7px)", offset: .5 }, { opacity: 1, transform: "translateY(0)" }] :
      [{ transform: "translateY(0)" }, { transform: "translateY(-6px)", offset: .45 }, { transform: "translateY(0)" }], { duration: portal ? 250 : 170, easing: "ease-out" });
    if (nodes.burst.animate && events.some(event => ["star", "bone", "portal", "win"].includes(event.type))) {
      nodes.burst.setAttribute("transform", transform([state.x, state.y]));
      burstAnimation = nodes.burst.animate([{ opacity: 0, scale: .65 }, { opacity: 1, scale: .9, offset: .3 }, { opacity: 0, scale: 1.25 }], { duration: 320, easing: "ease-out" });
    }
  };
  const startIsland = (fresh, message) => {
    cancelMotion();
    if (fresh) { makeMap(); drawMap(); }
    state = engine.createState(map, mode); ready = false;
    nodes.drawing.setAttribute("transform", "scale(1 1)");
    nodes.result.hidden = true;
    render(); nodes.status.textContent = message || "出发！收集 3 颗阅读星，再走到蓝色信箱。";
    nodes.board.focus({ preventScroll: true });
  };
  const announce = events => {
    const contains = name => events.some(event => event.type === name);
    if (contains("win")) return "投递成功！得分 " + state.score + "。信箱里有一篇文章，也可以去下一座小岛。";
    if (contains("lose")) return "步数用完啦。已得 " + state.score + " 分，可以重走本岛，或换张地图再试。";
    if (contains("star")) return state.collected.length === 3 ? "3 颗阅读星集齐啦！现在走到蓝色信箱完成投递。" : "找到第 " + state.collected.length + " 颗阅读星！继续寻找，再去蓝色信箱。";
    if (contains("bone")) return mode === "challenge" ? "找到奖励骨头！加 50 分，也多了 3 步。" : "找到奖励骨头！加 50 分，继续去找阅读星。";
    if (contains("portal")) return "穿过紫色传送门，来到另一端！继续寻找阅读星和信箱。";
    if (contains("mailbox-needs-stars")) return "这是投递信箱，还差 " + (3 - state.collected.length) + " 颗阅读星。";
    if (contains("blocked")) return "这边是灌木或小岛边缘，换个方向试试。";
    return "已走 " + state.moves + " 步，找到 " + state.collected.length + " / 3 颗阅读星。";
  };
  const move = direction => {
    if (ready || state.phase !== "playing" || document.hidden) return;
    const outcome = engine.step(map, state, direction);
    state = outcome.state;
    if (outcome.moved && (direction === "left" || direction === "right")) nodes.drawing.setAttribute("transform", direction === "left" ? "scale(-1 1)" : "scale(1 1)");
    saveBest(); render(); nodes.status.textContent = announce(outcome.events);
    if (state.phase !== "playing") {
      const next = article();
      nodes["result-link"].href = next.url; nodes["result-link"].textContent = next.title + " ↗";
      nodes["result-heading"].textContent = state.phase === "won" ? "投递成功，信箱里有一篇文章。" : "休息一下，也有好文章等你。";
      nodes.result.hidden = false;
    }
    if (outcome.moved) animate(outcome.events);
  };
  const keyboard = event => {
    if (ready || event.metaKey || event.ctrlKey || event.altKey || event.target.closest("input,textarea,select,[contenteditable]")) return;
    const direction = keys[event.key] || keys[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault(); move(direction);
  };

  try {
    archive = JSON.parse(nodes.archive.textContent).filter(post => post && typeof post.url === "string" && post.url.startsWith("/posts/") && typeof post.title === "string");
    if (!archive.length) return;
    readBest(); makeMap(); drawMap(); state = engine.createState(map, mode); render();
    nodes.board.addEventListener("keydown", safely(keyboard));
    nodes.controls.addEventListener("keydown", safely(keyboard));
    nodes.start.addEventListener("click", safely(() => startIsland(false)));
    nodes.shuffle.addEventListener("click", safely(() => startIsland(true, "新地图准备好啦！收集阅读星，再去蓝色信箱。")));
    nodes.next.addEventListener("click", safely(() => {
      if (state.phase !== "won") return;
      level++; startIsland(true, "来到第 " + level + " 座小岛，开始新的寻宝吧！");
    }));
    modeButtons.forEach(button => button.addEventListener("click", safely(() => {
      const selected = button.dataset.dogMode;
      if (selected !== "free" && selected !== "challenge") return;
      mode = selected; level = 1;
      startIsland(true, mode === "challenge" ? "限步邮差出发！收齐 3 颗星，再在步数用完前送到信箱。" : "自由寻宝出发！没有步数限制，慢慢探索这座小岛。");
    })));
    directions.forEach(button => button.addEventListener("click", safely(() => move(button.dataset.dogMove))));
    nodes.skip.addEventListener("click", safely(event => { event.currentTarget.href = article().url; }));
    if (reduced.addEventListener) reduced.addEventListener("change", () => { if (reduced.matches) cancelMotion(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancelMotion(); });
    nodes.controls.hidden = false; nodes.modes.hidden = false; nodes.fallback.hidden = true;
    nodes.status.textContent = "选个玩法或点“开始散步”。收 3 颗星后送到蓝色信箱，骨头和传送门会带来惊喜。";
    root.classList.add("is-playable");
  } catch (_) { fail(); }
})();
