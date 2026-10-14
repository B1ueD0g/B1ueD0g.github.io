(() => {
  "use strict";
  const station = document.querySelector(".signal-station");
  if (!station) return;
  const beacons = [...station.querySelectorAll("[data-signal]")];
  const status = station.querySelector("#signal-status");
  const invitation = station.querySelector("#signal-invitation");
  const reset = station.querySelector("#signal-reset");
  const random = station.querySelector("#signal-random");
  const found = new Set();
  let archive = [];
  try {
    archive = JSON.parse(document.getElementById("signal-archive").textContent)
      .filter(item => item && typeof item.url === "string" && item.url.startsWith("/posts/"));
  } catch (_) { /* SSR links remain usable. */ }
  const update = () => {
    status.textContent = found.size === 3 ? "3 / 3 · 三条路线都已点亮。下一篇，由你选择。" : `${found.size} / 3 · 点亮信标，发现一条阅读路线。`;
    reset.hidden = found.size === 0;
    invitation.hidden = found.size > 0;
  };
  beacons.forEach(beacon => {
    const panel = document.getElementById(beacon.getAttribute("aria-controls"));
    if (!panel) return;
    beacon.hidden = false;
    beacon.addEventListener("click", () => {
      found.add(beacon.dataset.signal);
      beacon.setAttribute("aria-expanded", "true");
      panel.hidden = false;
      beacon.classList.add("is-just-found");
      window.setTimeout(() => beacon.classList.remove("is-just-found"), 500);
      update();
    });
  });
  reset.addEventListener("click", () => {
    found.clear();
    beacons.forEach(beacon => {
      beacon.setAttribute("aria-expanded", "false");
      document.getElementById(beacon.getAttribute("aria-controls")).hidden = true;
    });
    update();
    beacons[0]?.focus({preventScroll:true});
  });
  random.addEventListener("click", () => {
    if (archive.length) random.href = archive[Math.floor(Math.random() * archive.length)].url;
  });
  update();
  station.classList.add("is-interactive");
})();
