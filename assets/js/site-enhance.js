  (function () {
    var toast = document.getElementById("copy-toast");
    var timer = null;
    var externalTrackCache = {};

    window.BlueDogEnv = window.BlueDogEnv || {};
    window.BlueDogEnv.isWeChatWebView = false;

    function runWhenIdle(task, timeout) {
      if (typeof task !== "function") return;
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(function () {
          task();
        }, { timeout: timeout || 900 });
        return;
      }
      window.setTimeout(task, 0);
    }

    function showToast(message, tone) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove("is-error", "is-success");
      toast.classList.add(tone === "error" ? "is-error" : "is-success");
      toast.classList.add("is-visible");
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        toast.classList.remove("is-visible");
      }, 1700);
    }

    window.BlueDogShowToast = showToast;
    document.documentElement.classList.add("bd-ready");

    function fallbackCopy(text) {
      var eventCopied = false;
      function onCopy(event) {
        if (!event.clipboardData) return;
        event.clipboardData.setData("text/plain", text);
        event.preventDefault();
        eventCopied = true;
      }

      document.addEventListener("copy", onCopy);
      try {
        document.execCommand("copy");
      } catch (error) {
        eventCopied = false;
      }
      document.removeEventListener("copy", onCopy);
      if (eventCopied) return true;

      var input = document.createElement("textarea");
      var selection = document.getSelection ? document.getSelection() : null;
      var selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.top = "0";
      input.style.left = "-9999px";
      input.style.width = "1px";
      input.style.height = "1px";
      input.style.fontSize = "16px";
      document.body.appendChild(input);
      try {
        input.focus({ preventScroll: true });
      } catch (error) {
        input.focus();
      }
      input.select();
      input.setSelectionRange(0, input.value.length);
      var copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }
      document.body.removeChild(input);
      if (selection) {
        selection.removeAllRanges();
        if (selectedRange) selection.addRange(selectedRange);
      }
      return copied;
    }

    function trackEvent(name, props) {
      if (!name) return;
      var payload = props || {};
      try {
        if (typeof window.plausible === "function") {
          window.plausible(name, { props: payload });
        }
      } catch (error) {
        console.warn("plausible track failed", error);
      }
      try {
        if (window.umami && typeof window.umami.track === "function") {
          window.umami.track(name, payload);
        }
      } catch (error) {
        console.warn("umami track failed", error);
      }
    }

    window.BlueDogTrack = trackEvent;

    function isEditableTarget(target) {
      if (!target) return false;
      var tag = (target.tagName || "").toLowerCase();
      return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    }

    function setupNavShrink() {
      var header = document.querySelector(".header");
      if (!header) return;
      var ticking = false;
      function updateState() {
        ticking = false;
        document.body.classList.toggle("nav-scrolled", window.scrollY > 18);
      }
      function onScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateState);
      }
      updateState();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    function setupLogoResponse() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var logo = document.querySelector(".header .logo");
      var anchor = logo ? logo.querySelector("a") : null;
      if (!logo || !anchor) return;

      var frame = 0;
      var nextState = null;

      function commitState() {
        frame = 0;
        if (!nextState) return;
        logo.style.setProperty("--bd-logo-tilt-x", nextState.tiltX + "deg");
        logo.style.setProperty("--bd-logo-tilt-y", nextState.tiltY + "deg");
        logo.style.setProperty("--bd-logo-shift-x", nextState.shiftX + "px");
        logo.style.setProperty("--bd-logo-shift-y", nextState.shiftY + "px");
        logo.style.setProperty("--bd-logo-focus-x", nextState.focusX + "%");
        logo.style.setProperty("--bd-logo-focus-y", nextState.focusY + "%");
        logo.style.setProperty("--bd-logo-glow", String(nextState.glow));
      }

      function schedule(state) {
        nextState = state;
        if (frame) return;
        frame = window.requestAnimationFrame(commitState);
      }

      function reset() {
        schedule({
          tiltX: 0,
          tiltY: 0,
          shiftX: 0,
          shiftY: 0,
          focusX: 50,
          focusY: 50,
          glow: 0,
        });
      }

      anchor.addEventListener("pointermove", function (event) {
        var rect = anchor.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var ratioX = (event.clientX - rect.left) / rect.width;
        var ratioY = (event.clientY - rect.top) / rect.height;
        var offsetX = ratioX - 0.5;
        var offsetY = ratioY - 0.5;

        schedule({
          tiltX: offsetX * 11,
          tiltY: offsetY * -10,
          shiftX: offsetX * 10,
          shiftY: offsetY * 6,
          focusX: Math.max(0, Math.min(100, ratioX * 100)),
          focusY: Math.max(0, Math.min(100, ratioY * 100)),
          glow: 1,
        });
      });

      anchor.addEventListener("pointerenter", function () {
        schedule({
          tiltX: 0,
          tiltY: 0,
          shiftX: 0,
          shiftY: 0,
          focusX: 50,
          focusY: 50,
          glow: 0.58,
        });
      });

      anchor.addEventListener("pointerleave", reset);
      anchor.addEventListener("blur", reset, true);
      reset();
    }

    function setupRevealOnScroll() {
      var nodes = Array.prototype.slice.call(
        document.querySelectorAll(
          ".home-info, .home-surface-card, .about-pro .about-block, .about-pro .about-work-item, .post-entry, .post-entry-with-date, .search-command, .search-guide, .search-filters, .search-recent, .search-empty, .search-result-card"
        )
      );
      if (nodes.length === 0) return;

      nodes.forEach(function (node, index) {
        node.classList.add("bd-reveal");
        node.style.setProperty("--bd-reveal-delay", String((index % 6) * 35) + "ms");
      });

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
        nodes.forEach(function (node) {
          node.classList.add("is-revealed");
        });
        return;
      }

      var observer = new IntersectionObserver(
        function (entries, currentObserver) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-revealed");
            currentObserver.unobserve(entry.target);
          });
        },
        {
          rootMargin: "0px 0px -8% 0px",
          threshold: 0.08,
        }
      );

      nodes.forEach(function (node) {
        observer.observe(node);
      });
    }

    function setupInteractivePanels() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var panels = Array.prototype.slice.call(
        document.querySelectorAll(".home-info, .about-block-works")
      );
      if (panels.length === 0) return;

      panels.forEach(function (panel) {
        var frame = 0;
        var nextState = null;

        function commit() {
          frame = 0;
          if (!nextState) return;
          panel.style.setProperty("--bd-focus-x", nextState.x + "%");
          panel.style.setProperty("--bd-focus-y", nextState.y + "%");
        }

        function schedule(x, y) {
          nextState = { x: x, y: y };
          if (frame) return;
          frame = window.requestAnimationFrame(commit);
        }

        function reset() {
          schedule(50, 18);
        }

        panel.addEventListener("pointermove", function (event) {
          var rect = panel.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var x = ((event.clientX - rect.left) / rect.width) * 100;
          var y = ((event.clientY - rect.top) / rect.height) * 100;
          schedule(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
        });

        panel.addEventListener("pointerleave", reset);
        panel.addEventListener("blur", reset, true);
        reset();
      });
    }

    function setupDepthSurfaces() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var selectors = [
        ".home-surface-card",
        ".about-pro .about-work-item",
        ".search-command",
        ".search-result-card"
      ];

      function bindSurface(surface) {
        if (!surface || surface.dataset.bdDepthBound === "1") return;
        surface.dataset.bdDepthBound = "1";

        var frame = 0;
        var nextState = null;
        var focusYDefault = surface.matches(".search-command") ? 16 : 18;

        function commit() {
          frame = 0;
          if (!nextState) return;
          surface.style.setProperty("--bd-depth-tilt-x", nextState.tiltX + "deg");
          surface.style.setProperty("--bd-depth-tilt-y", nextState.tiltY + "deg");
          surface.style.setProperty("--bd-depth-shift-x", nextState.shiftX + "px");
          surface.style.setProperty("--bd-depth-shift-y", nextState.shiftY + "px");
          surface.style.setProperty("--bd-depth-glow", String(nextState.glow));
          surface.style.setProperty("--bd-focus-x", nextState.focusX + "%");
          surface.style.setProperty("--bd-focus-y", nextState.focusY + "%");
        }

        function schedule(state) {
          nextState = state;
          if (frame) return;
          frame = window.requestAnimationFrame(commit);
        }

        function reset() {
          schedule({
            tiltX: 0,
            tiltY: 0,
            shiftX: 0,
            shiftY: 0,
            glow: 0,
            focusX: 50,
            focusY: focusYDefault,
          });
        }

        surface.addEventListener("pointermove", function (event) {
          var rect = surface.getBoundingClientRect();
          if (!rect.width || !rect.height) return;

          var ratioX = (event.clientX - rect.left) / rect.width;
          var ratioY = (event.clientY - rect.top) / rect.height;
          var offsetX = ratioX - 0.5;
          var offsetY = ratioY - 0.5;

          schedule({
            tiltX: offsetX * 7.6,
            tiltY: offsetY * -5.6,
            shiftX: offsetX * 10,
            shiftY: offsetY * 8,
            glow: 1,
            focusX: Math.max(0, Math.min(100, ratioX * 100)),
            focusY: Math.max(0, Math.min(100, ratioY * 100)),
          });
        });

        surface.addEventListener("pointerenter", function () {
          schedule({
            tiltX: 0,
            tiltY: 0,
            shiftX: 0,
            shiftY: 0,
            glow: 0.34,
            focusX: 50,
            focusY: focusYDefault,
          });
        });

        surface.addEventListener("pointerleave", reset);
        surface.addEventListener("blur", reset, true);
        reset();
      }

      function bindAll(root) {
        selectors.forEach(function (selector) {
          root.querySelectorAll(selector).forEach(bindSurface);
        });
      }

      bindAll(document);

      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (!(node instanceof Element)) return;
            if (selectors.some(function (selector) { return node.matches(selector); })) {
              bindSurface(node);
            }
            bindAll(node);
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    function setupMagneticClusters() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var clusterConfigs = [
        { container: ".home-search-tag-list", item: "a" },
        { container: ".home-atlas-list", item: "a" },
        { container: ".search-guide-tags", item: "button" },
        { container: ".search-guide-synonyms", item: "button" }
      ];

      clusterConfigs.forEach(function (config) {
        document.querySelectorAll(config.container).forEach(function (cluster) {
          var items = Array.prototype.slice.call(cluster.querySelectorAll(config.item));
          if (items.length === 0) return;

          function reset() {
            items.forEach(function (item) {
              item.style.setProperty("--bd-magnet-x", "0px");
              item.style.setProperty("--bd-magnet-y", "0px");
              item.style.setProperty("--bd-magnet-scale", "1");
              item.style.setProperty("--bd-magnet-glow", "0");
            });
          }

          cluster.addEventListener("pointermove", function (event) {
            items.forEach(function (item) {
              var rect = item.getBoundingClientRect();
              var centerX = rect.left + rect.width / 2;
              var centerY = rect.top + rect.height / 2;
              var deltaX = event.clientX - centerX;
              var deltaY = event.clientY - centerY;
              var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
              var strength = Math.max(0, 1 - distance / 160);
              item.style.setProperty("--bd-magnet-x", (deltaX * 0.045 * strength).toFixed(2) + "px");
              item.style.setProperty("--bd-magnet-y", (deltaY * 0.032 * strength).toFixed(2) + "px");
              item.style.setProperty("--bd-magnet-scale", (1 + strength * 0.045).toFixed(3));
              item.style.setProperty("--bd-magnet-glow", strength.toFixed(3));
            });
          });

          cluster.addEventListener("pointerleave", reset);
          cluster.addEventListener("blur", reset, true);
          reset();
        });
      });
    }

    function setupSocialDock() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var rows = Array.prototype.slice.call(document.querySelectorAll(".about-pro .about-social .social-icons"));
      if (rows.length === 0) return;

      rows.forEach(function (row) {
        var icons = Array.prototype.slice.call(row.querySelectorAll("a"));
        if (icons.length === 0) return;

        function reset() {
          icons.forEach(function (icon) {
            icon.style.setProperty("--bd-social-scale", "1");
            icon.style.setProperty("--bd-social-lift", "0px");
            icon.style.setProperty("--bd-social-glow", "0");
            icon.style.setProperty("--bd-mag-x", "0px");
            icon.style.setProperty("--bd-mag-y", "0px");
          });
        }

        row.addEventListener("pointermove", function (event) {
          icons.forEach(function (icon) {
            var rect = icon.getBoundingClientRect();
            var centerX = rect.left + rect.width / 2;
            var centerY = rect.top + rect.height / 2;
            var deltaX = event.clientX - centerX;
            var deltaY = event.clientY - centerY;
            var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            var strength = Math.max(0, 1 - distance / 150);
            var scale = 1 + strength * 0.16;
            var lift = strength * -10;
            var magX = deltaX * 0.06 * strength;
            var magY = deltaY * 0.04 * strength;

            icon.style.setProperty("--bd-social-scale", scale.toFixed(3));
            icon.style.setProperty("--bd-social-lift", lift.toFixed(2) + "px");
            icon.style.setProperty("--bd-social-glow", strength.toFixed(3));
            icon.style.setProperty("--bd-mag-x", magX.toFixed(2) + "px");
            icon.style.setProperty("--bd-mag-y", magY.toFixed(2) + "px");
          });
        });

        row.addEventListener("pointerleave", reset);
        row.addEventListener("blur", reset, true);
        reset();
      });
    }

    function setupHeroTilt() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var heroes = Array.prototype.slice.call(document.querySelectorAll(".about-pro .about-hero"));
      if (heroes.length === 0) return;

      heroes.forEach(function (hero) {
        var frame = 0;
        var nextState = null;

        function commit() {
          frame = 0;
          if (!nextState) return;
          hero.style.setProperty("--bd-hero-tilt-x", nextState.tiltX + "deg");
          hero.style.setProperty("--bd-hero-tilt-y", nextState.tiltY + "deg");
          hero.style.setProperty("--bd-hero-shift-x", nextState.shiftX + "px");
          hero.style.setProperty("--bd-hero-shift-y", nextState.shiftY + "px");
          hero.style.setProperty("--bd-focus-x", nextState.focusX + "%");
          hero.style.setProperty("--bd-focus-y", nextState.focusY + "%");
          hero.style.setProperty("--bd-hero-glow", String(nextState.glow));
        }

        function schedule(state) {
          nextState = state;
          if (frame) return;
          frame = window.requestAnimationFrame(commit);
        }

        function reset() {
          schedule({
            tiltX: 0,
            tiltY: 0,
            shiftX: 0,
            shiftY: 0,
            focusX: 50,
            focusY: 18,
            glow: 0,
          });
        }

        hero.addEventListener("pointermove", function (event) {
          var rect = hero.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var ratioX = (event.clientX - rect.left) / rect.width;
          var ratioY = (event.clientY - rect.top) / rect.height;
          var offsetX = ratioX - 0.5;
          var offsetY = ratioY - 0.5;

          schedule({
            tiltX: offsetX * 6,
            tiltY: offsetY * -5,
            shiftX: offsetX * 8,
            shiftY: offsetY * 4,
            focusX: Math.max(0, Math.min(100, ratioX * 100)),
            focusY: Math.max(0, Math.min(100, ratioY * 100)),
            glow: 0.85,
          });
        });

        hero.addEventListener("pointerenter", function () {
          schedule({
            tiltX: 0,
            tiltY: 0,
            shiftX: 0,
            shiftY: 0,
            focusX: 50,
            focusY: 18,
            glow: 0.35,
          });
        });

        hero.addEventListener("pointerleave", reset);
        hero.addEventListener("blur", reset, true);
        reset();
      });
    }

    function setupHomeHeroScene() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var hero = document.querySelector(".home-info");
      if (!hero) return;

      var frame = 0;
      var nextState = null;

      function commit() {
        frame = 0;
        if (!nextState) return;
        hero.style.setProperty("--bd-home-tilt-x", nextState.tiltX + "deg");
        hero.style.setProperty("--bd-home-tilt-y", nextState.tiltY + "deg");
        hero.style.setProperty("--bd-home-shift-x", nextState.shiftX + "px");
        hero.style.setProperty("--bd-home-shift-y", nextState.shiftY + "px");
        hero.style.setProperty("--bd-home-glow", String(nextState.glow));
      }

      function schedule(state) {
        nextState = state;
        if (frame) return;
        frame = window.requestAnimationFrame(commit);
      }

      function reset() {
        schedule({
          tiltX: 0,
          tiltY: 0,
          shiftX: 0,
          shiftY: 0,
          glow: 0,
        });
      }

      hero.addEventListener("pointermove", function (event) {
        var rect = hero.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        var ratioX = (event.clientX - rect.left) / rect.width;
        var ratioY = (event.clientY - rect.top) / rect.height;
        var offsetX = ratioX - 0.5;
        var offsetY = ratioY - 0.5;

        schedule({
          tiltX: offsetX * 6.4,
          tiltY: offsetY * -4.8,
          shiftX: offsetX * 18,
          shiftY: offsetY * 10,
          glow: 1,
        });
      });

      hero.addEventListener("pointerenter", function () {
        schedule({
          tiltX: 0,
          tiltY: 0,
          shiftX: 0,
          shiftY: 0,
          glow: 0.44,
        });
      });

      hero.addEventListener("pointerleave", reset);
      hero.addEventListener("blur", reset, true);
      reset();
    }

    function setupThemeToggleResponse() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var toggle = document.getElementById("theme-toggle");
      if (!toggle) return;

      var frame = 0;
      var nextState = null;

      function commit() {
        frame = 0;
        if (!nextState) return;
        toggle.style.setProperty("--bd-toggle-tilt-x", nextState.tiltX + "deg");
        toggle.style.setProperty("--bd-toggle-tilt-y", nextState.tiltY + "deg");
        toggle.style.setProperty("--bd-toggle-shift-x", nextState.shiftX + "px");
        toggle.style.setProperty("--bd-toggle-shift-y", nextState.shiftY + "px");
      }

      function schedule(state) {
        nextState = state;
        if (frame) return;
        frame = window.requestAnimationFrame(commit);
      }

      function reset() {
        schedule({
          tiltX: 0,
          tiltY: 0,
          shiftX: 0,
          shiftY: 0,
        });
      }

      toggle.addEventListener("pointermove", function (event) {
        var rect = toggle.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var ratioX = (event.clientX - rect.left) / rect.width;
        var ratioY = (event.clientY - rect.top) / rect.height;
        var offsetX = ratioX - 0.5;
        var offsetY = ratioY - 0.5;

        schedule({
          tiltX: offsetX * 14,
          tiltY: offsetY * -12,
          shiftX: offsetX * 6,
          shiftY: offsetY * 5,
        });
      });

      toggle.addEventListener("pointerleave", reset);
      toggle.addEventListener("blur", reset, true);
      reset();
    }

    function setupSearchShortcut() {
      document.addEventListener("keydown", function (event) {
        if (event.key !== "/") return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (isEditableTarget(event.target)) return;
        event.preventDefault();

        var searchPath = (window.BlueDogEnv && window.BlueDogEnv.searchPath) || "/search/";
        var homePath = (window.BlueDogEnv && window.BlueDogEnv.homePath) || "/";
        var resolvedSearchPath = new URL(searchPath, window.location.origin).pathname.replace(/\/?$/, "/");
        var resolvedHomePath = new URL(homePath, window.location.origin).pathname.replace(/\/?$/, "/");
        var path = (window.location.pathname || "/").replace(/\/?$/, "/");
        var searchInput = document.querySelector("#search-query-input, #search input");
        var homeInput = document.getElementById("home-search-input");

        if (path.indexOf(resolvedSearchPath) === 0 && searchInput) {
          searchInput.focus();
          searchInput.select();
          return;
        }
        if (path === resolvedHomePath && homeInput) {
          homeInput.focus();
          homeInput.select();
          trackEvent("search_shortcut_focus_home", { page: path });
          return;
        }
        trackEvent("search_shortcut_jump", { page: path });
        window.location.href = searchPath;
      });
    }

    function setupThemeToggleA11y() {
      var toggle = document.getElementById("theme-toggle");
      if (!toggle) return;

      function syncThemeState() {
        var currentTheme = document.documentElement.getAttribute("data-theme");
        var dark = currentTheme === "dark";
        toggle.setAttribute("aria-pressed", dark ? "true" : "false");
        toggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
        toggle.setAttribute("title", dark ? "Switch to light theme (Alt + T)" : "Switch to dark theme (Alt + T)");
      }

      syncThemeState();
      toggle.addEventListener("click", function () {
        toggle.classList.remove("is-switching");
        void toggle.offsetWidth;
        toggle.classList.add("is-switching");
        window.setTimeout(syncThemeState, 0);
        window.setTimeout(function () {
          toggle.classList.remove("is-switching");
        }, 280);
      });
    }

    function setupGeneratedA11yLabels() {
      var updateLabels = function () {
        var pagefindInput = document.querySelector(".pagefind-ui__search-input");
        if (pagefindInput && !pagefindInput.getAttribute("aria-label")) {
          pagefindInput.setAttribute("aria-label", "Search posts");
        }
      };

      updateLabels();
      var observerRoot = document.getElementById("search") || document.body;
      if (!observerRoot || !("MutationObserver" in window)) return;

      var observer = new MutationObserver(function () {
        updateLabels();
      });
      observer.observe(observerRoot, { childList: true, subtree: true });
    }

    function setupReadingProgress() {
      var articleContent = document.querySelector(".post-single .editorial-content, .post-single .post-content");
      if (!articleContent) return;

      var bar = document.createElement("div");
      bar.className = "reading-progress";
      bar.setAttribute("aria-hidden", "true");
      document.body.appendChild(bar);

      var ticking = false;
      function updateProgress() {
        ticking = false;
        var viewport = window.innerHeight || 1;
        var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        var articleTop = articleContent.getBoundingClientRect().top + scrollTop;
        var articleHeight = Math.max(articleContent.scrollHeight, 1);
        var start = Math.max(0, articleTop - 110);
        var end = Math.max(start + 1, articleTop + articleHeight - viewport * 0.42);
        var progress = (scrollTop - start) / (end - start);
        progress = Math.min(Math.max(progress, 0), 1);
        bar.style.transform = "scaleX(" + progress + ")";
      }

      function onScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateProgress);
      }

      updateProgress();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      window.addEventListener("load", onScroll);
    }

    function setupHeadingHighlight() {
      var headings = Array.prototype.slice.call(
        document.querySelectorAll(".editorial-content h2[id], .editorial-content h3[id], .editorial-content h4[id], .post-content h2[id], .post-content h3[id], .post-content h4[id]")
      );
      if (headings.length === 0) return;

      var tocMap = {};
      document.querySelectorAll(".toc a[href^='#']").forEach(function (link) {
        var id = decodeURIComponent((link.getAttribute("href") || "").slice(1));
        if (id) tocMap[id] = link;
      });

      var offsets = [];
      var activeId = "";
      var ticking = false;

      function computeOffsets() {
        offsets = headings.map(function (heading) {
          return {
            id: heading.id,
            top: heading.getBoundingClientRect().top + window.scrollY,
          };
        });
      }

      function setActive(id) {
        if (!id || id === activeId) return;
        headings.forEach(function (heading) {
          heading.classList.toggle("is-active-heading", heading.id === id);
        });
        Object.keys(tocMap).forEach(function (key) {
          var isActive = key === id;
          tocMap[key].classList.toggle("is-active", isActive);
          if (isActive) tocMap[key].setAttribute("aria-current", "location");
          else tocMap[key].removeAttribute("aria-current");
        });
        activeId = id;
      }

      function updateActiveHeading() {
        ticking = false;
        if (!offsets.length) return;
        var pointer = (window.scrollY || 0) + 136;
        var nextActive = offsets[0].id;
        for (var i = 0; i < offsets.length; i++) {
          if (pointer >= offsets[i].top - 4) {
            nextActive = offsets[i].id;
          } else {
            break;
          }
        }
        setActive(nextActive);
      }

      function onScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateActiveHeading);
      }

      computeOffsets();
      updateActiveHeading();
      window.addEventListener("resize", function () {
        computeOffsets();
        onScroll();
      });
      window.addEventListener("load", function () {
        computeOffsets();
        onScroll();
      });
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    function setupEditorialTocRail() {
      var detailsList = Array.prototype.slice.call(document.querySelectorAll(".editorial-toc-rail .toc details"));
      if (detailsList.length === 0) return;

      var desktop = window.matchMedia("(min-width: 1500px)");

      function syncState() {
        detailsList.forEach(function (details) {
          details.open = desktop.matches;
        });
      }

      syncState();

      if (typeof desktop.addEventListener === "function") {
        desktop.addEventListener("change", syncState);
      } else if (typeof desktop.addListener === "function") {
        desktop.addListener(syncState);
      }

      window.addEventListener("resize", syncState);
      window.addEventListener("load", syncState);
    }

    function setupAboutSectionNav() {
      var nav = document.querySelector(".about-section-nav");
      if (!nav) return;

      var links = Array.prototype.slice.call(nav.querySelectorAll("a[href^='#']"));
      var sections = links.map(function (link) {
        var id = decodeURIComponent((link.getAttribute("href") || "").slice(1));
        return id ? document.getElementById(id) : null;
      }).filter(Boolean);
      if (!links.length || !sections.length) return;

      var offsets = [];
      var activeId = "";
      var ticking = false;

      function computeOffsets() {
        offsets = sections.map(function (section) {
          return {
            id: section.id,
            top: section.getBoundingClientRect().top + window.scrollY,
          };
        });
      }

      function setActive(id) {
        if (!id || id === activeId) return;
        links.forEach(function (link) {
          var isActive = link.getAttribute("href") === "#" + id;
          link.classList.toggle("is-active", isActive);
          if (isActive) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
        activeId = id;
      }

      function updateActive() {
        ticking = false;
        if (!offsets.length) return;
        var pointer = (window.scrollY || 0) + Math.min(220, (window.innerHeight || 1) * 0.32);
        var nextId = offsets[0].id;
        offsets.forEach(function (item) {
          if (pointer >= item.top) nextId = item.id;
        });
        setActive(nextId);
      }

      function requestUpdate() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateActive);
      }

      links.forEach(function (link) {
        link.addEventListener("click", function () {
          var id = decodeURIComponent((link.getAttribute("href") || "").slice(1));
          if (id) setActive(id);
        });
      });

      computeOffsets();
      updateActive();
      window.addEventListener("scroll", requestUpdate, { passive: true });
      window.addEventListener("resize", function () {
        computeOffsets();
        requestUpdate();
      });
      window.addEventListener("load", function () {
        computeOffsets();
        requestUpdate();
      });
    }

    function setupFootnotePreview() {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

      var refs = Array.prototype.slice.call(
        document.querySelectorAll(".editorial-content sup a[href^='#fn'], .editorial-content .footnote-ref a[href^='#fn'], .post-content sup a[href^='#fn'], .post-content .footnote-ref a[href^='#fn']")
      );
      if (refs.length === 0) return;

      var preview = document.createElement("div");
      preview.className = "bd-footnote-preview";
      document.body.appendChild(preview);

      function readFootnote(link) {
        var href = link.getAttribute("href") || "";
        var targetId = decodeURIComponent(href.slice(1));
        if (!targetId) return "";
        var target = document.getElementById(targetId);
        if (!target) return "";
        var clone = target.cloneNode(true);
        clone.querySelectorAll("a").forEach(function (node) {
          node.remove();
        });
        return clone.textContent.replace(/\s+/g, " ").trim();
      }

      function positionPreview(link) {
        var rect = link.getBoundingClientRect();
        var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        var maxWidth = Math.min(420, Math.max(240, viewportWidth - 32));
        preview.style.maxWidth = maxWidth + "px";
        var previewWidth = preview.offsetWidth || maxWidth;
        var left = Math.min(
          Math.max(16, rect.left + rect.width / 2 - previewWidth / 2),
          Math.max(16, viewportWidth - previewWidth - 16)
        );
        var top = Math.max(20, rect.top - preview.offsetHeight - 16);
        preview.style.setProperty("--bd-footnote-x", left + "px");
        preview.style.setProperty("--bd-footnote-y", top + "px");
      }

      function show(link) {
        var content = readFootnote(link);
        if (!content) return;
        preview.textContent = content;
        preview.classList.add("is-visible");
        positionPreview(link);
      }

      function hide() {
        preview.classList.remove("is-visible");
      }

      refs.forEach(function (link) {
        link.addEventListener("mouseenter", function () {
          show(link);
        });
        link.addEventListener("focus", function () {
          show(link);
        });
        link.addEventListener("mouseleave", hide);
        link.addEventListener("blur", hide);
      });

      window.addEventListener("scroll", hide, { passive: true });
      window.addEventListener("resize", hide);
    }

    function setupLightbox() {
      var images = Array.prototype.slice.call(document.querySelectorAll(".editorial-content img, .post-content img"));
      if (images.length === 0) return;

      var items = [];
      images.forEach(function (img) {
        var source = img.currentSrc || img.getAttribute("src");
        if (!source) return;
        var anchor = img.closest("a[href]");
        var resolved = source;
        if (anchor) {
          try {
            resolved = new URL(anchor.getAttribute("href"), window.location.origin).href;
          } catch (error) {
            resolved = source;
          }
          anchor.setAttribute("data-lightbox-anchor", "1");
        }
        var index = items.length;
        items.push({
          src: resolved,
          caption: img.getAttribute("alt") || img.getAttribute("title") || "",
        });
        img.classList.add("is-lightbox-ready");
        img.setAttribute("data-lightbox-index", String(index));
      });

      if (items.length === 0) return;

      var overlay = document.createElement("div");
      overlay.className = "bd-lightbox";
      overlay.innerHTML =
        '<button type="button" class="bd-lightbox-close" aria-label="Close">×</button>' +
        '<button type="button" class="bd-lightbox-prev" aria-label="Previous">‹</button>' +
        '<img class="bd-lightbox-img" alt="" />' +
        '<button type="button" class="bd-lightbox-next" aria-label="Next">›</button>' +
        '<div class="bd-lightbox-caption"></div>';
      document.body.appendChild(overlay);

      var closeBtn = overlay.querySelector(".bd-lightbox-close");
      var prevBtn = overlay.querySelector(".bd-lightbox-prev");
      var nextBtn = overlay.querySelector(".bd-lightbox-next");
      var imageEl = overlay.querySelector(".bd-lightbox-img");
      var captionEl = overlay.querySelector(".bd-lightbox-caption");
      var activeIndex = -1;

      function render(index) {
        if (index < 0 || index >= items.length) return;
        activeIndex = index;
        var current = items[activeIndex];
        imageEl.setAttribute("src", current.src);
        imageEl.setAttribute("alt", current.caption || "Image preview");
        captionEl.textContent = current.caption || "";
        prevBtn.style.display = items.length > 1 ? "inline-flex" : "none";
        nextBtn.style.display = items.length > 1 ? "inline-flex" : "none";
      }

      function open(index) {
        render(index);
        overlay.classList.add("is-open");
        document.body.classList.add("bd-lightbox-open");
        trackEvent("image_lightbox_open", {
          page: window.location.pathname,
          index: String(index),
        });
      }

      function close() {
        overlay.classList.remove("is-open");
        document.body.classList.remove("bd-lightbox-open");
      }

      function next() {
        if (activeIndex < 0) return;
        render((activeIndex + 1) % items.length);
      }

      function prev() {
        if (activeIndex < 0) return;
        render((activeIndex - 1 + items.length) % items.length);
      }

      document.addEventListener("click", function (event) {
        var img = event.target.closest(".editorial-content img.is-lightbox-ready, .post-content img.is-lightbox-ready");
        if (!img) return;
        var anchor = img.closest("a[data-lightbox-anchor='1']");
        if (anchor) event.preventDefault();
        var index = parseInt(img.getAttribute("data-lightbox-index") || "-1", 10);
        if (Number.isNaN(index) || index < 0) return;
        open(index);
      });

      closeBtn.addEventListener("click", close);
      nextBtn.addEventListener("click", next);
      prevBtn.addEventListener("click", prev);
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) close();
      });

      document.addEventListener("keydown", function (event) {
        if (!overlay.classList.contains("is-open")) return;
        if (event.key === "Escape") close();
        if (event.key === "ArrowRight") next();
        if (event.key === "ArrowLeft") prev();
      });
    }

    function setupEditorialTables() {
      var tables = Array.prototype.slice.call(document.querySelectorAll(".editorial-content table, .post-content table"));
      if (tables.length === 0) return;

      function decorateTableWrap(wrap, table) {
        if (!wrap || !table) return;
        wrap.setAttribute("data-scroll-hint", "Scroll");
        wrap.dataset.bdTableReady = "1";
        window.setTimeout(function () {
          if (table.scrollWidth > wrap.clientWidth + 4) {
            wrap.classList.add("is-scrollable");
          } else {
            wrap.classList.remove("is-scrollable");
          }
        }, 60);
      }

      tables.forEach(function (table) {
        if (table.closest(".highlight, .highlighttable, .gist")) return;
        if (table.parentElement && table.parentElement.classList.contains("editorial-table-wrap")) {
          decorateTableWrap(table.parentElement, table);
          return;
        }

        var wrap = document.createElement("div");
        wrap.className = "editorial-table-wrap";
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
        decorateTableWrap(wrap, table);
      });
    }

    function setupCodeTools() {
      var blocks = Array.prototype.slice.call(document.querySelectorAll(".editorial-content pre, .post-content pre"));
      if (blocks.length === 0) return;

      function getCodeLanguage(pre) {
        var code = pre.querySelector("code");
        var className = code ? String(code.className || "") : String(pre.className || "");
        var match = className.match(/(?:language|lang)-([a-z0-9_#+.-]+)/i);
        if (!match) return "Code";
        return match[1].replace(/[-_]/g, " ").toUpperCase();
      }

      blocks.forEach(function (pre) {
        if (pre.dataset.bdCodeTools === "1") return;
        if (pre.closest(".highlighttable, .gist")) return;
        pre.dataset.bdCodeTools = "1";

        var host = pre.parentElement && pre.parentElement.classList.contains("highlight") ? pre.parentElement : pre;
        host.classList.add("bd-code-shell");
        host.setAttribute("data-code-lang", getCodeLanguage(pre));
        Array.prototype.forEach.call(host.querySelectorAll(":scope > .copy-code, pre > .copy-code"), function (legacyButton) {
          legacyButton.remove();
        });
        if (host.querySelector(":scope > .bd-code-copy")) return;

        var button = document.createElement("button");
        button.type = "button";
        button.className = "bd-code-copy";
        button.textContent = "Copy";
        button.setAttribute("aria-label", "Copy code block");

        button.addEventListener("click", function () {
          var clone = pre.cloneNode(true);
          Array.prototype.forEach.call(clone.querySelectorAll(".bd-code-copy, .copy-code"), function (node) {
            node.remove();
          });
          var text = clone.innerText || clone.textContent || "";
          function finish(copied) {
            button.textContent = copied ? "Copied" : "Failed";
            button.classList.toggle("is-copied", copied);
            if (copied) showToast("代码已复制", "success");
            window.setTimeout(function () {
              button.textContent = "Copy";
              button.classList.remove("is-copied");
            }, 1400);
          }

          var clipboardApi = window.navigator && window.navigator.clipboard;
          try {
            window.focus();
          } catch (error) {
            // Ignore focus failures; clipboard methods still report their own result.
          }

          // Run the legacy path while the click still owns user activation. If it is
          // deferred to the Clipboard API rejection handler, restrictive browsers
          // may reject both methods after the activation window has closed.
          if (fallbackCopy(text)) {
            finish(true);
            return;
          }

          if (clipboardApi && window.isSecureContext && clipboardApi.writeText) {
            clipboardApi.writeText(text).then(function () {
              finish(true);
            }).catch(function () {
              finish(false);
            });
            return;
          }

          finish(false);
        });

        host.appendChild(button);
      });
    }

    function setupColdLabSystem() {
      var root = document.documentElement;
      var body = document.body;
      if (!body) return;

      root.classList.add("bd-cold-lab");

      var path = (window.location.pathname || "/").replace(/\/?$/, "/");
      var mode = "archive";
      if (body.classList.contains("home-page") || path === "/") mode = "home";
      else if (path.indexOf("/search/") === 0) mode = "search";
      else if (path.indexOf("/about/") === 0) mode = "about";
      else if (document.querySelector(".post-single-editorial, article.post-single")) mode = "article";
      body.setAttribute("data-lab-mode", mode);

      function ensureAccent(container, className, html, prepend) {
        if (!container || container.querySelector(":scope > ." + className)) return null;
        var node = document.createElement("span");
        node.className = className;
        node.setAttribute("aria-hidden", "true");
        if (html) node.innerHTML = html;
        if (prepend) container.prepend(node);
        else container.appendChild(node);
        return node;
      }

      function prepareGlitchTitle(titleNode) {
        if (!titleNode || titleNode.dataset.bdGlitchTitle === "1") return;
        var source = (titleNode.textContent || "").replace(/\s+/g, " ").trim();
        if (!source) return;
        titleNode.dataset.bdGlitchTitle = "1";
        titleNode.setAttribute("data-lab-title", source);
        titleNode.classList.add("bd-glitch-title");
      }

      if (!document.querySelector(".bd-lab-frame")) {
        var frame = document.createElement("div");
        frame.className = "bd-lab-frame";
        frame.setAttribute("aria-hidden", "true");
        frame.innerHTML =
          '<span class="bd-lab-corner bd-lab-corner-tl"></span>' +
          '<span class="bd-lab-corner bd-lab-corner-tr"></span>' +
          '<span class="bd-lab-corner bd-lab-corner-bl"></span>' +
          '<span class="bd-lab-corner bd-lab-corner-br"></span>' +
          '<span class="bd-lab-scanline"></span>';
        body.prepend(frame);
      }

      var homeHero = document.querySelector("body.home-page .home-info");
      if (homeHero) {
        ensureAccent(homeHero, "bd-lab-matrix", "", true);
        ensureAccent(homeHero, "bd-lab-status", "SYSTEM ONLINE", false);
      }

      var articleHeader = document.querySelector("article.post-single.post-single-editorial .editorial-header");
      if (articleHeader) {
        ensureAccent(articleHeader, "bd-lab-matrix", "", true);
      }

      Array.prototype.slice.call(
        document.querySelectorAll(
          "body.home-page .home-info .entry-header h1, .search-page-header h1, .about-pro .about-hero .post-title, article.post-single.post-single-editorial .editorial-title"
        )
      ).forEach(prepareGlitchTitle);

      var surfaces = Array.prototype.slice.call(
        document.querySelectorAll(
          ".home-surface-card, .search-result-card, .about-pro .about-block, .about-pro .about-work-item, .post-entry, .post-entry-with-date"
        )
      );
      surfaces.forEach(function (surface, index) {
        surface.style.setProperty("--bd-lab-index", String(index));
        surface.setAttribute("data-lab-node", String(index + 1).padStart(2, "0"));
      });

      var headings = Array.prototype.slice.call(
        document.querySelectorAll(".editorial-content h2[id], .post-content h2[id], .search-page-header h1, .about-pro .about-block h2")
      );
      headings.forEach(function (heading, index) {
        heading.style.setProperty("--bd-lab-index", String(index));
        if (!heading.getAttribute("data-lab-heading")) {
          heading.setAttribute("data-lab-heading", String(index + 1).padStart(2, "0"));
        }
      });

      var commandNodes = Array.prototype.slice.call(document.querySelectorAll(".search-command, .home-search-box"));
      commandNodes.forEach(function (node) {
        node.addEventListener("focusin", function () {
          node.classList.add("is-lab-armed");
          root.classList.add("bd-lab-input-active");
        });
        node.addEventListener("focusout", function () {
          node.classList.remove("is-lab-armed");
          root.classList.remove("bd-lab-input-active");
        });
      });

      window.setTimeout(function () {
        root.classList.add("bd-lab-online");
      }, 80);
    }

    function setupReactBitsInspiredMotion() {
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      var title = document.querySelector("body.home-page .home-info .entry-header h1");

      if (title && title.dataset.bdSplitText !== "1") {
        var source = (title.textContent || "").replace(/\s+/g, " ").trim();
        if (source) {
          title.dataset.bdSplitText = "1";
          title.textContent = "";
          source.split(" ").forEach(function (word, index, words) {
            var span = document.createElement("span");
            span.className = "bd-split-word";
            span.style.setProperty("--bd-word-index", String(index));
            span.textContent = word;
            title.appendChild(span);
            if (index < words.length - 1) title.appendChild(document.createTextNode(" "));
          });
        }
      }

      var nodes = Array.prototype.slice.call(
        document.querySelectorAll(
          ".home-search-box, .home-surface-card, .search-command, .search-result-card, .about-pro .about-hero, .about-pro .about-block, .about-pro .about-work-item, .bd-code-shell, .editorial-table-wrap"
        )
      );

      nodes.forEach(function (node) {
        if (node.tagName === "PRE") return;
        if (node.dataset.bdReactBitsFx !== "1") {
          node.dataset.bdReactBitsFx = "1";
          node.classList.add("bd-motion-surface");

          if (!node.querySelector(":scope > .bd-spotlight")) {
            var spotlight = document.createElement("span");
            spotlight.className = "bd-spotlight";
            spotlight.setAttribute("aria-hidden", "true");
            node.prepend(spotlight);
          }

          if (!node.querySelector(":scope > .bd-glare")) {
            var glare = document.createElement("span");
            glare.className = "bd-glare";
            glare.setAttribute("aria-hidden", "true");
            node.prepend(glare);
          }

          if (!node.querySelector(":scope > .bd-frame-border")) {
            var frameBorder = document.createElement("span");
            frameBorder.className = "bd-frame-border";
            frameBorder.setAttribute("aria-hidden", "true");
            node.prepend(frameBorder);
          }
        }

        if (!finePointer || reduceMotion || node.dataset.bdReactBitsPointer === "1") return;
        node.dataset.bdReactBitsPointer = "1";

        var frame = 0;
        var next = {
          x: 0,
          y: 0,
          tiltX: 0,
          tiltY: 0,
          shiftX: 0,
          shiftY: 0,
        };

        function commit() {
          frame = 0;
          node.style.setProperty("--bd-spot-x", next.x + "px");
          node.style.setProperty("--bd-spot-y", next.y + "px");
          node.style.setProperty("--bd-fx-tilt-x", next.tiltX + "deg");
          node.style.setProperty("--bd-fx-tilt-y", next.tiltY + "deg");
          node.style.setProperty("--bd-fx-shift-x", next.shiftX + "px");
          node.style.setProperty("--bd-fx-shift-y", next.shiftY + "px");
        }

        node.addEventListener("pointermove", function (event) {
          var rect = node.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var x = event.clientX - rect.left;
          var y = event.clientY - rect.top;
          var relX = x / rect.width - 0.5;
          var relY = y / rect.height - 0.5;
          var tiltScale = node.classList.contains("home-surface-card") || node.classList.contains("search-result-card") || node.classList.contains("about-work-item") ? 5.2 : 2.2;

          next.x = Math.round(x);
          next.y = Math.round(y);
          next.tiltX = Number((-relY * tiltScale).toFixed(2));
          next.tiltY = Number((relX * tiltScale).toFixed(2));
          next.shiftX = Number((relX * 4).toFixed(2));
          next.shiftY = Number((relY * 4).toFixed(2));
          node.classList.add("is-bd-motion-hot");

          if (!frame) frame = window.requestAnimationFrame(commit);
        }, { passive: true });

        node.addEventListener("pointerleave", function () {
          next.x = 0;
          next.y = 0;
          next.tiltX = 0;
          next.tiltY = 0;
          next.shiftX = 0;
          next.shiftY = 0;
          node.classList.remove("is-bd-motion-hot");
          if (!frame) frame = window.requestAnimationFrame(commit);
        });
      });
    }

    function setupPageTransition() {
      document.body.classList.remove("is-page-leaving");
    }

    function copyEmail(email) {
      if (!email) return;
      function onResult(copied) {
        if (copied) {
          showToast("邮箱已复制: " + email, "success");
          trackEvent("email_copy", { email: email, page: window.location.pathname });
        } else {
          showToast("复制失败，请手动复制: " + email, "error");
          trackEvent("email_copy_failed", { page: window.location.pathname });
        }
      }

      if (fallbackCopy(email)) {
        onResult(true);
        return;
      }

      if (window.navigator && window.navigator.clipboard && window.isSecureContext && window.navigator.clipboard.writeText) {
        window.navigator.clipboard.writeText(email).then(function () {
          onResult(true);
        }).catch(function () {
          onResult(false);
        });
      } else {
        onResult(false);
      }
    }

    document.addEventListener("click", function (event) {
      var link = event.target.closest("[data-copy-email]");
      if (!link) return;
      event.preventDefault();
      var email = link.getAttribute("data-copy-email");
      copyEmail(email);
    });

    document.addEventListener("click", function (event) {
      var tagAnchor = event.target.closest(".post-tags a");
      if (tagAnchor) {
        var tagName = (tagAnchor.getAttribute("data-tag-click") || tagAnchor.textContent || "").trim();
        if (tagName) {
          trackEvent("tag_click", { tag: tagName, page: window.location.pathname });
        }
      }

      var anchor = event.target.closest("a[href]");
      if (!anchor) return;
      var href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      var targetURL;
      try {
        targetURL = new URL(anchor.href, window.location.origin);
      } catch (error) {
        return;
      }
      if (targetURL.origin === window.location.origin) return;

      var key = targetURL.href + "::" + window.location.pathname;
      if (externalTrackCache[key]) return;
      externalTrackCache[key] = true;

      trackEvent("outbound_click", {
        host: targetURL.host,
        href: targetURL.href,
        page: window.location.pathname,
      });
    });

    setupThemeToggleA11y();
    setupGeneratedA11yLabels();
    setupNavShrink();
    setupColdLabSystem();
    setupRevealOnScroll();
    setupSearchShortcut();
    setupReadingProgress();
    setupEditorialTocRail();
    setupAboutSectionNav();
    setupEditorialTables();
    setupCodeTools();
    runWhenIdle(setupHeadingHighlight, 800);
    runWhenIdle(setupFootnotePreview, 950);
    runWhenIdle(setupEditorialTables, 1100);
    runWhenIdle(setupCodeTools, 1160);
    runWhenIdle(setupLightbox, 1240);
    setupPageTransition();
  })();
