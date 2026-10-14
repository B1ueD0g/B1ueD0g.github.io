(() => {
  "use strict";
  const root = document.querySelector(".dog-not-found");
  if (!root) return;
  let map, archive;
  try {
    map = JSON.parse(document.getElementById("dog-map").textContent);
    archive = JSON.parse(document.getElementById("dog-archive").textContent)
      .filter(post => post && typeof post.url === "string" && post.url.startsWith("/posts/") && typeof post.title === "string");
    if (!archive.length || !Array.isArray(map.walls) || !Array.isArray(map.fragments)) return;
  } catch (_) { return; }
  const board = document.getElementById("dog-board");
  const controls = document.getElementById("dog-controls");
  const player = document.getElementById("dog-player");
  const drawing = document.getElementById("dog-drawing");
  const hop = document.getElementById("dog-hop");
  const burst = document.getElementById("dog-burst");
  const status = document.getElementById("dog-status");
  const start = document.getElementById("dog-start");
  const result = document.getElementById("dog-result");
  const resultLink = document.getElementById("dog-result-link");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const walls = new Set(map.walls);
  const found = new Set();
  const directionButtons = [...root.querySelectorAll("[data-dog-move]")];
  const fragments = [...root.querySelectorAll("[data-fragment]")];
  const scoreStars = [...root.querySelectorAll("[data-score-star]")];
  const deltas = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  const keys = {ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",w:"up",s:"down",a:"left",d:"right"};
  let x = map.start[0], y = map.start[1], state = "ready";
  let hopAnimation = null, burstAnimation = null;
  const article = () => archive[Math.floor(Math.random() * archive.length)];
  const cancelMotion = () => {
    if (hopAnimation) hopAnimation.cancel();
    if (burstAnimation) burstAnimation.cancel();
    hopAnimation = burstAnimation = null;
  };
  const position = () => {
    player.setAttribute("transform", `translate(${map.originX + x * map.stepX} ${map.originY + y * map.stepY})`);
    board.dataset.x = String(x); board.dataset.y = String(y);
    board.dataset.found = String(found.size); board.dataset.state = state;
    document.getElementById("dog-count").textContent = `${found.size} / 3`;
    scoreStars.forEach((star,index) => star.classList.toggle("is-found",index < found.size));
  };
  const animateStep = collected => {
    cancelMotion();
    if (reduceMotion.matches || !hop.animate || document.hidden) return;
    hopAnimation = hop.animate([{transform:"translateY(0)"},{transform:"translateY(-6px)",offset:.45},{transform:"translateY(0)"}],{duration:170,easing:"ease-out"});
    if (collected && burst.animate) {
      burst.setAttribute("transform", `translate(${map.originX + x * map.stepX} ${map.originY + y * map.stepY})`);
      burstAnimation = burst.animate([{opacity:0,scale:.65},{opacity:1,scale:.9,offset:.3},{opacity:0,scale:1.25}],{duration:300,easing:"ease-out"});
    }
  };
  const reset = () => {
    cancelMotion();
    x = map.start[0]; y = map.start[1]; state = "playing"; found.clear();
    fragments.forEach(fragment => {fragment.removeAttribute("hidden");});
    drawing.setAttribute("transform","scale(1 1)");
    result.hidden = true;
    directionButtons.forEach(button => {button.disabled = false;});
    start.innerHTML = '重开一局 <span aria-hidden="true">↺</span>';
    status.textContent = "出发！沿浅绿色小路，找到三颗金色阅读星。";
    position();
    board.focus({preventScroll:true});
  };
  const move = direction => {
    if (state !== "playing" || document.hidden) return;
    const delta = deltas[direction];
    if (!delta) return;
    const nextX = x + delta[0], nextY = y + delta[1];
    if (nextX < 0 || nextY < 0 || nextX >= map.columns || nextY >= map.rows) {
      status.textContent = "到小岛边缘啦，换个方向继续走。"; return;
    }
    const key = `${nextX},${nextY}`;
    if (walls.has(key)) {status.textContent = "这边是小灌木，绕一小步就好。"; return;}
    x = nextX; y = nextY;
    if (direction === "left" || direction === "right") drawing.setAttribute("transform",direction === "left" ? "scale(-1 1)" : "scale(1 1)");
    const fragment = fragments.find(item => item.dataset.fragment === key);
    const collected = fragment && !found.has(key);
    if (collected) {found.add(key); fragment.setAttribute("hidden","");}
    status.textContent = collected ? `找到第 ${found.size} 颗阅读星！还有 ${3 - found.size} 颗。` : `继续散步，已找到 ${found.size} / 3 颗阅读星。`;
    if (found.size === map.fragments.length) {
      state = "won";
      const next = article();
      resultLink.href = next.url; resultLink.textContent = next.title + " ↗";
      result.hidden = false;
      directionButtons.forEach(button => {button.disabled = true;});
      start.innerHTML = '再玩一局 <span aria-hidden="true">↺</span>';
      status.textContent = "三颗星都找到啦！小狗把一篇文章放进了下面的信箱。";
    }
    position(); animateStep(collected);
  };
  const keyboard = event => {
    if (state === "ready" || event.metaKey || event.ctrlKey || event.altKey || event.target.closest("input,textarea,select,[contenteditable]")) return;
    const direction = keys[event.key] || keys[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault(); move(direction);
  };
  board.addEventListener("keydown",keyboard);
  controls.addEventListener("keydown",keyboard);
  start.addEventListener("click",reset);
  directionButtons.forEach(button => button.addEventListener("click",() => move(button.dataset.dogMove)));
  document.getElementById("dog-skip").addEventListener("click",event => {event.currentTarget.href = article().url;});
  if (reduceMotion.addEventListener) reduceMotion.addEventListener("change",() => {if (reduceMotion.matches) cancelMotion();});
  document.addEventListener("visibilitychange",() => {if (document.hidden) cancelMotion();});
  controls.hidden = false;
  document.getElementById("dog-fallback").hidden = true;
  status.textContent = "点“开始散步”，帮小狗找到 3 颗阅读星。";
  root.classList.add("is-playable");
})();
