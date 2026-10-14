(function () {
  "use strict";

  document.querySelectorAll("pre, code, kbd, samp, .katex, .MathJax").forEach(function (element) {
    element.setAttribute("translate", "no");
    element.classList.add("notranslate");
  });

  document.querySelectorAll("[data-language-switch]").forEach(function (root) {
    var summary = root.querySelector("summary");
    var original = root.querySelector("[data-language-original]");
    var links = root.querySelectorAll("[data-language-target]");
    if (!summary || !original) return;

    function currentPage() {
      try {
        var base = new URL(root.getAttribute("data-language-origin"));
        var canonical = new URL(root.getAttribute("data-language-canonical"), base);
        if (base.protocol !== "https:" || canonical.origin !== base.origin || base.username || base.password || canonical.username || canonical.password) return null;
        var query = window.location.search.slice(1).split("&").filter(function (part) {
          var name = part.split("=")[0];
          try { name = decodeURIComponent(name.replace(/\+/g, " ")); } catch (error) {}
          return name.indexOf("_x_tr_") !== 0;
        }).join("&");
        canonical.search = query;
        canonical.hash = window.location.hash;
        return canonical;
      } catch (error) {
        return null;
      }
    }

    function updateLinks() {
      var page = currentPage();
      if (!page) return false;
      var proxyHost = page.hostname.replace(/\./g, "-") + ".translate.goog";
      var requested = new URLSearchParams(window.location.search).get("_x_tr_tl");
      var active = window.location.hostname === proxyHost && (requested === "en" || requested === "de") ? requested : "zh-CN";
      original.toggleAttribute("aria-current", active === "zh-CN");
      if (active === "zh-CN") original.setAttribute("aria-current", "page");
      original.href = page.href;
      links.forEach(function (link) {
        var language = link.getAttribute("data-language-target");
        if (language !== "en" && language !== "de") {
          link.removeAttribute("href");
          link.setAttribute("aria-disabled", "true");
          return;
        }
        var translated = new URL("https://translate.google.com/translate");
        translated.searchParams.set("sl", "zh-CN");
        translated.searchParams.set("tl", language);
        translated.searchParams.set("u", page.href);
        link.href = translated.href;
        link.removeAttribute("aria-disabled");
        if (language === active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      return true;
    }

    function close(restoreFocus) {
      root.open = false;
      if (restoreFocus) summary.focus({ preventScroll: true });
    }

    updateLinks();
    root.addEventListener("toggle", function () {
      if (root.open) updateLinks();
    });
    root.addEventListener("click", function (event) {
      var link = event.target.closest("[data-language-original], [data-language-target]");
      if (!link || !root.contains(link)) return;
      if (!updateLinks() || link.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        return;
      }
      if (link.hasAttribute("aria-current")) event.preventDefault();
      close(true);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && root.open) {
        event.preventDefault();
        close(true);
      }
      if (!root.contains(document.activeElement)) return;
      var items = Array.from(root.querySelectorAll("a[href]"));
      if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) < 0) return;
      event.preventDefault();
      root.open = true;
      var index = items.indexOf(document.activeElement);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = items.length - 1;
      else if (index < 0) index = event.key === "ArrowDown" ? 0 : items.length - 1;
      else index = (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[index].focus();
    });
    document.addEventListener("click", function (event) {
      if (root.open && !root.contains(event.target)) close(root.contains(document.activeElement));
    });
    window.addEventListener("hashchange", updateLinks);
    window.addEventListener("popstate", updateLinks);
  });
})();
