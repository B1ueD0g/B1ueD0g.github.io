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
      var input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      var copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }
      document.body.removeChild(input);
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
          tiltX: offsetX * 8,
          tiltY: offsetY * -8,
          shiftX: offsetX * 6,
          shiftY: offsetY * 4,
          focusX: Math.max(0, Math.min(100, ratioX * 100)),
          focusY: Math.max(0, Math.min(100, ratioY * 100)),
          glow: 0.9,
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
          glow: 0.45,
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
        node.style.setProperty("--bd-reveal-delay", String((index % 7) * 55) + "ms");
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
        document.querySelectorAll(".home-info, .home-surface-card, .about-block-works, .search-command")
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
          tocMap[key].classList.toggle("is-active", key === id);
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

      var desktop = window.matchMedia("(min-width: 1121px)");

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

      tables.forEach(function (table) {
        if (table.closest(".highlight, .highlighttable, .gist")) return;
        if (table.parentElement && table.parentElement.classList.contains("editorial-table-wrap")) return;

        var wrap = document.createElement("div");
        wrap.className = "editorial-table-wrap";
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
      });
    }

    function setupPageTransition() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var leaving = false;

      document.addEventListener("click", function (event) {
        var anchor = event.target.closest("a[href]");
        if (!anchor || leaving) return;
        if (anchor.hasAttribute("data-no-transition")) return;
        if (anchor.target && anchor.target !== "_self") return;
        if (anchor.hasAttribute("download")) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        var href = anchor.getAttribute("href") || "";
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

        var nextURL;
        try {
          nextURL = new URL(anchor.href, window.location.origin);
        } catch (error) {
          return;
        }

        if (nextURL.origin !== window.location.origin) return;
        if (nextURL.href === window.location.href) return;
        if (nextURL.pathname === window.location.pathname && nextURL.search === window.location.search && nextURL.hash) return;

        leaving = true;
        event.preventDefault();
        document.body.classList.add("is-page-leaving");
        window.setTimeout(function () {
          window.location.href = nextURL.href;
        }, 140);
      });
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

      if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(function () {
          onResult(true);
        }).catch(function () {
          onResult(fallbackCopy(email));
        });
      } else {
        onResult(fallbackCopy(email));
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
    setupLogoResponse();
    setupRevealOnScroll();
    setupInteractivePanels();
    setupSocialDock();
    setupMagneticClusters();
    setupSearchShortcut();
    setupReadingProgress();
    setupEditorialTocRail();
    runWhenIdle(setupHeadingHighlight, 800);
    runWhenIdle(setupFootnotePreview, 950);
    runWhenIdle(setupEditorialTables, 1100);
    runWhenIdle(setupLightbox, 1200);
    setupPageTransition();
  })();
