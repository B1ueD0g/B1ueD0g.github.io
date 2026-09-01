(function () {
  "use strict";

  var app = document.querySelector("[data-search-app]");
  var configNode = document.getElementById("search-config");
  if (!app || !configNode) return;

  var config = {};
  try {
    config = JSON.parse(configNode.textContent || "{}");
  } catch (error) {
    config = {};
  }

  var input = document.getElementById("search-query-input");
  var clearButton = document.getElementById("search-query-clear");
  var statusNode = document.getElementById("search-status");
  var loadingNode = document.getElementById("search-loading");
  var emptyNode = document.getElementById("search-empty");
  var resultsRoot = document.getElementById("search-results");
  var resultsCount = document.getElementById("search-results-count");
  var loadMoreWrap = document.getElementById("search-load-more");
  var loadMoreButton = document.getElementById("search-load-more-button");
  var recentWrap = document.getElementById("search-recent");
  var recentList = document.getElementById("search-recent-list");
  var recentClear = document.getElementById("search-recent-clear");
  var synonymTip = document.getElementById("search-synonym-tip");
  var activeStateNode = document.getElementById("search-active-state");
  var moreFilters = document.querySelector(".search-more-filters");

  var recentStorageKey = "bluedog_recent_searches_v3";
  var recentMax = 6;
  var initialResultLimit = 8;
  var resultStep = 8;
  var resultLimit = initialResultLimit;
  var renderTimer = 0;
  var requestSerial = 0;
  var activeResultIndex = -1;
  var enginePromise = null;
  var synonymLookup = {};
  var state = { query: "", year: "", tag: "", autoJump: false };

  function track(name, props) {
    if (typeof window.BlueDogTrack === "function") {
      window.BlueDogTrack(name, props || {});
    }
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeTerm(value) {
    return String(value || "").trim().replace(/^#/, "").toLowerCase();
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function splitTerms(value) {
    return String(value || "")
      .split(/[\s,，、/]+/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function uniqueTerms(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).filter(function (item) {
      var key = normalizeTerm(item);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function buildSynonymLookup() {
    var source = config.synonyms || {};
    Object.keys(source).forEach(function (rawKey) {
      var key = normalizeTerm(rawKey);
      if (!key) return;
      synonymLookup[key] = uniqueTerms(Array.isArray(source[rawKey]) ? source[rawKey] : []);
    });
  }

  function buildQueryBundle(query) {
    var raw = String(query || "").trim();
    var primaryTerms = uniqueTerms([raw].concat(splitTerms(raw)));
    var secondaryTerms = [];
    primaryTerms.forEach(function (term) {
      (synonymLookup[normalizeTerm(term)] || []).forEach(function (synonym) {
        secondaryTerms.push(synonym);
      });
    });
    return {
      raw: raw,
      primaryTerms: primaryTerms,
      secondaryTerms: uniqueTerms(secondaryTerms).filter(function (term) {
        return primaryTerms.indexOf(term) === -1;
      }),
    };
  }

  function parseTags(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value || "").split("||").map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }

  function normalizeFallbackRecord(record) {
    var tags = parseTags(record.tags);
    var title = String(record.title || "").trim();
    var summary = String(record.summary || "").replace(/\s+/g, " ").trim();
    var plain = String(record.plain || record.content || "").replace(/\s+/g, " ").trim();
    return {
      title: title,
      url: record.relPermalink || record.permalink || "#",
      year: String(record.year || ""),
      dateISO: String(record.dateISO || record.date || ""),
      unix: Number(record.unix || 0),
      tags: tags,
      summary: summary,
      plain: plain,
      haystackTitle: normalizeText(title),
      haystackTags: normalizeText(tags.join(" ")),
      haystackSummary: normalizeText(summary),
      haystackPlain: normalizeText(plain),
    };
  }

  async function loadFallbackEngine() {
    var response = await fetch(config.fallbackIndex || "/index.json", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Search fallback index returned " + response.status);
    var payload = await response.json();
    if (typeof payload === "string") payload = JSON.parse(payload || "[]");
    if (!Array.isArray(payload)) throw new Error("Search fallback index is invalid");
    return { kind: "fallback", records: payload.map(normalizeFallbackRecord) };
  }

  async function loadPagefindEngine() {
    var pagefind = await import(config.pagefindModule || "/pagefind/pagefind.js");
    if (typeof pagefind.options === "function") {
      await pagefind.options({ baseUrl: config.baseURL || "/" });
    }
    if (typeof pagefind.init === "function") await pagefind.init();
    return { kind: "pagefind", api: pagefind };
  }

  function initEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = (config.preferFallback ? loadFallbackEngine() : loadPagefindEngine())
      .catch(function (error) {
        if (config.preferFallback) throw error;
        console.warn("Pagefind unavailable; using the local JSON fallback.");
        return loadFallbackEngine();
      });
    return enginePromise;
  }

  function getFilters() {
    var filters = {};
    if (state.year) filters.year = state.year;
    if (state.tag) filters.tag = state.tag;
    return filters;
  }

  function highlightText(source, terms) {
    var safeSource = escapeHTML(source);
    var list = uniqueTerms(terms).sort(function (left, right) {
      return right.length - left.length;
    });
    if (!list.length) return safeSource;
    var pattern = new RegExp("(" + list.map(escapeRegExp).join("|") + ")", "gi");
    return safeSource.replace(pattern, "<mark>$1</mark>");
  }

  function fallbackExcerpt(record, terms) {
    var source = record.summary || record.plain || "";
    if (!source) return "";
    var normalized = source.toLowerCase();
    var foundAt = -1;
    var foundTerm = "";
    uniqueTerms(terms).sort(function (a, b) { return b.length - a.length; }).some(function (term) {
      var index = normalized.indexOf(String(term).toLowerCase());
      if (index < 0) return false;
      foundAt = index;
      foundTerm = term;
      return true;
    });
    if (foundAt < 0) return highlightText(source.slice(0, 180).trim(), terms);
    var start = Math.max(0, foundAt - 48);
    var end = Math.min(source.length, foundAt + foundTerm.length + 112);
    var snippet = source.slice(start, end).trim();
    if (start > 0) snippet = "… " + snippet;
    if (end < source.length) snippet += " …";
    return highlightText(snippet, terms);
  }

  function scoreFallbackRecord(record, bundle) {
    if (state.year && record.year !== state.year) return null;
    if (state.tag && record.tags.indexOf(state.tag) === -1) return null;
    if (!bundle.raw) return { score: record.unix, matchedTerms: [] };

    var score = 0;
    var matched = [];
    function award(points, term) {
      score += points;
      matched.push(term);
    }
    bundle.primaryTerms.forEach(function (term) {
      var key = normalizeText(term);
      if (record.haystackTitle.indexOf(key) !== -1) award(16, term);
      else if (record.haystackTags.indexOf(key) !== -1) award(12, term);
      else if (record.haystackSummary.indexOf(key) !== -1) award(8, term);
      else if (record.haystackPlain.indexOf(key) !== -1) award(4, term);
    });
    bundle.secondaryTerms.forEach(function (term) {
      var key = normalizeText(term);
      if (record.haystackTitle.indexOf(key) !== -1) award(7, term);
      else if (record.haystackTags.indexOf(key) !== -1) award(5, term);
      else if (record.haystackSummary.indexOf(key) !== -1) award(3, term);
      else if (record.haystackPlain.indexOf(key) !== -1) award(1, term);
    });
    if (!score) return null;
    return { score: score, matchedTerms: uniqueTerms(matched) };
  }

  function searchFallback(engine, bundle) {
    var items = [];
    engine.records.forEach(function (record) {
      var score = scoreFallbackRecord(record, bundle);
      if (!score) return;
      items.push({
        record: Object.assign({}, record, {
          excerptHTML: fallbackExcerpt(record, bundle.primaryTerms.concat(bundle.secondaryTerms)),
        }),
        matchedTerms: score.matchedTerms,
        score: score.score,
      });
    });
    items.sort(function (left, right) {
      if (right.score !== left.score) return right.score - left.score;
      return right.record.unix - left.record.unix;
    });
    return Promise.resolve({ total: items.length, items: items.slice(0, resultLimit) });
  }

  async function searchPagefind(engine, bundle) {
    var options = { filters: getFilters() };
    if (!bundle.raw) options.sort = { date: "desc" };
    var responses = [await engine.api.search(bundle.raw || null, options)];

    if (bundle.raw && bundle.secondaryTerms.length && responses[0].results.length < initialResultLimit) {
      var related = await Promise.all(bundle.secondaryTerms.slice(0, 3).map(function (term) {
        return engine.api.search(term, options);
      }));
      responses = responses.concat(related);
    }

    var seen = {};
    var rawResults = [];
    responses.forEach(function (response) {
      (response && response.results ? response.results : []).forEach(function (result) {
        if (seen[result.id]) return;
        seen[result.id] = true;
        rawResults.push(result);
      });
    });

    var visible = rawResults.slice(0, resultLimit);
    var data = await Promise.all(visible.map(function (result) { return result.data(); }));
    var matchedTerms = bundle.primaryTerms.concat(bundle.secondaryTerms.slice(0, 3));
    var items = data.map(function (result) {
      var meta = result.meta || {};
      var dateISO = String(meta.date || "");
      var tags = parseTags(meta.tags);
      return {
        matchedTerms: matchedTerms,
        record: {
          title: String(meta.title || result.url || "Untitled"),
          url: result.url || "#",
          year: String(meta.year || dateISO.slice(0, 4)),
          dateISO: dateISO,
          tags: tags,
          summary: String(meta.summary || result.plain_excerpt || ""),
          excerptHTML: result.excerpt || escapeHTML(meta.summary || result.plain_excerpt || ""),
        },
      };
    });
    return { total: rawResults.length, items: items };
  }

  function getRecentSearches() {
    try {
      var value = JSON.parse(localStorage.getItem(recentStorageKey) || "[]");
      return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, recentMax) : [];
    } catch (error) {
      return [];
    }
  }

  function renderRecentSearches(values) {
    if (!recentWrap || !recentList) return;
    var list = Array.isArray(values) ? values : getRecentSearches();
    recentList.innerHTML = list.map(function (term) {
      return '<button type="button" data-recent-query="' + escapeHTML(term) + '">' + escapeHTML(term) + "</button>";
    }).join("");
    recentWrap.hidden = list.length === 0;
  }

  function saveRecentSearch(value) {
    var term = String(value || "").trim();
    if (!term) return;
    var next = uniqueTerms([term].concat(getRecentSearches())).slice(0, recentMax);
    try {
      localStorage.setItem(recentStorageKey, JSON.stringify(next));
    } catch (error) {
      return;
    }
    renderRecentSearches(next);
  }

  function syncFilterButtons() {
    document.querySelectorAll("[data-filter-year]").forEach(function (button) {
      button.classList.toggle("is-active", (button.getAttribute("data-filter-year") || "") === state.year);
    });
    document.querySelectorAll("[data-filter-tag]").forEach(function (button) {
      button.classList.toggle("is-active", (button.getAttribute("data-filter-tag") || "") === state.tag);
    });
    document.querySelectorAll("[data-search-tag]").forEach(function (button) {
      button.classList.toggle("is-active", (button.getAttribute("data-search-tag") || "") === state.tag);
    });
    if (state.tag && moreFilters && moreFilters.querySelector('[data-filter-tag="' + CSS.escape(state.tag) + '"]')) {
      moreFilters.open = true;
    }
  }

  function syncURL() {
    var params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.year) params.set("year", state.year);
    if (state.tag) params.set("tag", state.tag);
    var query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? "?" + query : ""));
  }

  function renderActiveState(total) {
    if (!activeStateNode) return;
    var pills = [];
    if (state.query) pills.push('<span class="search-active-pill"><strong>Query</strong><em>' + escapeHTML(state.query) + "</em></span>");
    if (state.year) pills.push('<span class="search-active-pill"><strong>Year</strong><em>' + escapeHTML(state.year) + "</em></span>");
    if (state.tag) pills.push('<span class="search-active-pill"><strong>Tag</strong><em>#' + escapeHTML(state.tag) + "</em></span>");
    if (!pills.length) {
      activeStateNode.hidden = true;
      activeStateNode.innerHTML = "";
      return;
    }
    pills.push('<span class="search-active-pill"><strong>Results</strong><em>' + String(total).padStart(2, "0") + "</em></span>");
    activeStateNode.innerHTML = '<span class="search-active-label">Active</span><div class="search-active-pills">' + pills.join("") + '</div><button type="button" class="search-active-reset" data-search-reset>Reset</button>';
    activeStateNode.hidden = false;
  }

  function renderSynonymTip(bundle, total) {
    if (!synonymTip) return;
    var terms = bundle.secondaryTerms.slice(0, 5);
    if (!bundle.raw || !terms.length) {
      synonymTip.hidden = true;
      synonymTip.innerHTML = "";
      return;
    }
    synonymTip.innerHTML = '<span class="search-synonym-intro">' + (total ? "Related terms:" : "Try related terms:") + "</span>" + terms.map(function (term) {
      return '<button type="button" data-synonym-term="' + escapeHTML(term) + '">#' + escapeHTML(term) + "</button>";
    }).join("");
    synonymTip.hidden = false;
  }

  function resultCards() {
    return resultsRoot ? Array.prototype.slice.call(resultsRoot.querySelectorAll(".search-result-card")) : [];
  }

  function setActiveResult(index, shouldFocus) {
    var cards = resultCards();
    if (!cards.length) {
      activeResultIndex = -1;
      return;
    }
    var nextIndex = Math.max(0, Math.min(cards.length - 1, index));
    if (nextIndex === activeResultIndex && !shouldFocus) return;
    activeResultIndex = nextIndex;
    cards.forEach(function (card, cardIndex) {
      card.classList.toggle("is-active", cardIndex === activeResultIndex);
    });
    var link = cards[activeResultIndex].querySelector(".search-result-title a");
    if (shouldFocus && link) link.focus({ preventScroll: true });
    cards[activeResultIndex].scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function comparablePath(value) {
    try {
      return new URL(value, window.location.origin).pathname.replace(/\/$/, "");
    } catch (error) {
      return String(value || "").replace(/\/$/, "");
    }
  }

  function canHydratePrerenderedResults(payload, bundle) {
    if (!resultsRoot || resultsRoot.getAttribute("data-prerendered") !== "true") return false;
    if (bundle.raw || state.year || state.tag) return false;
    var cards = resultCards();
    if (cards.length !== payload.items.length) return false;
    return cards.every(function (card, index) {
      var link = card.querySelector(".search-result-title a");
      return link && comparablePath(link.href) === comparablePath(payload.items[index].record.url);
    });
  }

  function renderResults(payload, bundle) {
    activeResultIndex = -1;
    if (!resultsRoot || !resultsCount) return;
    var preservePrerendered = canHydratePrerenderedResults(payload, bundle);
    resultsRoot.removeAttribute("data-prerendered");

    if (!payload.total) {
      resultsRoot.innerHTML = "";
      resultsCount.innerHTML = "";
      if (loadMoreWrap) loadMoreWrap.hidden = true;
      return;
    }

    resultsCount.innerHTML = '<span class="search-results-label">Results</span><span class="search-results-total">' + String(payload.total).padStart(2, "0") + '</span><span class="search-results-help">Showing ' + String(payload.items.length).padStart(2, "0") + " · ↑ ↓ Navigate</span>";
    if (preservePrerendered) {
      resultCards().forEach(function (card) {
        card.classList.remove("search-result-card-prerendered");
      });
    } else {
      resultsRoot.innerHTML = "";
      var fragment = document.createDocumentFragment();
      payload.items.forEach(function (item, index) {
        var record = item.record;
        var article = document.createElement("article");
        article.className = "search-result-card";
        article.setAttribute("data-result-index", String(index));
        article.innerHTML =
          '<div class="search-result-meta"><span class="search-result-index">' + String(index + 1).padStart(2, "0") + '</span><span class="search-result-date">' + escapeHTML(record.dateISO) + "</span></div>" +
          '<div class="search-result-body"><div class="search-result-top"><div class="search-result-tags">' + record.tags.slice(0, 3).map(function (tag) {
            return '<button type="button" class="search-result-tag" data-result-tag="' + escapeHTML(tag) + '">#' + escapeHTML(tag) + "</button>";
          }).join("") + '</div><span class="search-result-year">' + escapeHTML(record.year) + "</span></div>" +
          '<h2 class="search-result-title"><a href="' + escapeHTML(record.url) + '">' + highlightText(record.title, bundle.primaryTerms) + "</a></h2>" +
          '<p class="search-result-excerpt">' + record.excerptHTML + "</p>" +
          '<div class="search-result-footer"><a class="search-result-open" href="' + escapeHTML(record.url) + '">Open</a></div></div>';
        fragment.appendChild(article);
      });
      resultsRoot.appendChild(fragment);
    }
    if (loadMoreWrap && loadMoreButton) {
      var remaining = Math.max(0, payload.total - payload.items.length);
      loadMoreWrap.hidden = remaining === 0;
      loadMoreButton.textContent = remaining ? "Show " + Math.min(resultStep, remaining) + " more" : "All results shown";
    }
    if (payload.items.length) setActiveResult(0, false);
  }

  function renderStatus(total) {
    if (!statusNode) return;
    if (state.query) {
      statusNode.textContent = total ? "找到 " + total + " 条相关结果。" : "没有匹配结果，试试更短关键词或相关术语。";
    } else if (state.year || state.tag) {
      statusNode.textContent = "当前筛选得到 " + total + " 条记录。";
    } else {
      statusNode.textContent = "按时间倒序浏览全部档案；输入关键词可检索正文。";
    }
  }

  async function performSearch(options) {
    var run = options || {};
    var serial = ++requestSerial;
    if (!run.preserveLimit) resultLimit = initialResultLimit;
    state.query = input ? input.value.trim() : state.query;
    if (clearButton) clearButton.hidden = !state.query;
    if (resultsRoot) {
      resultsRoot.setAttribute("aria-busy", "true");
      if (resultsRoot.getAttribute("data-prerendered") !== "true" || state.query || state.year || state.tag) {
        resultsRoot.classList.add("is-updating");
      }
    }
    if (statusNode) statusNode.textContent = "正在检索…";

    try {
      var engine = await initEngine();
      var bundle = buildQueryBundle(state.query);
      var payload = engine.kind === "pagefind" ? await searchPagefind(engine, bundle) : await searchFallback(engine, bundle);
      if (serial !== requestSerial) return;
      renderResults(payload, bundle);
      renderActiveState(payload.total);
      renderSynonymTip(bundle, payload.total);
      renderStatus(payload.total);
      syncFilterButtons();
      syncURL();
      if (emptyNode) emptyNode.hidden = payload.total !== 0 || !state.query;
      if (loadingNode) loadingNode.hidden = true;
      if (state.autoJump && payload.items.length) {
        state.autoJump = false;
        window.location.href = payload.items[0].record.url;
      }
    } catch (error) {
      if (serial !== requestSerial) return;
      if (loadingNode) {
        loadingNode.hidden = false;
        loadingNode.textContent = "搜索索引暂时不可用，请刷新后重试。";
      }
      if (statusNode) statusNode.textContent = "搜索索引加载失败。";
      console.error("Archive search failed", error);
    } finally {
      if (resultsRoot) {
        resultsRoot.setAttribute("aria-busy", "false");
        window.requestAnimationFrame(function () {
          resultsRoot.classList.remove("is-updating");
        });
      }
    }
  }

  function requestSearch(options) {
    if (renderTimer) window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(function () { performSearch(options); }, 140);
  }

  function applyQuery(value) {
    if (!input) return;
    input.value = String(value || "").trim();
    state.query = input.value;
    if (state.query) saveRecentSearch(state.query);
    input.focus();
    requestSearch();
  }

  function resetSearch() {
    state.query = "";
    state.year = "";
    state.tag = "";
    if (input) input.value = "";
    syncFilterButtons();
    requestSearch();
  }

  function bindEvents() {
    if (!input) return;
    input.addEventListener("input", function () { requestSearch(); });
    input.addEventListener("focus", function () { initEngine(); }, { once: true });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        input.value = "";
        requestSearch();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveResult(0, true);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (input.value.trim()) saveRecentSearch(input.value.trim());
        performSearch();
      }
    });

    if (clearButton) clearButton.addEventListener("click", function () {
      input.value = "";
      input.focus();
      requestSearch();
    });

    document.addEventListener("click", function (event) {
      var quickTag = event.target.closest("[data-search-tag]");
      var year = event.target.closest("[data-filter-year]");
      var tag = event.target.closest("[data-filter-tag]");
      var hint = event.target.closest("[data-search-hint]");
      var recent = event.target.closest("[data-recent-query]");
      var synonym = event.target.closest("[data-synonym-term]");
      var emptyTag = event.target.closest("[data-empty-tag]");
      var resultTag = event.target.closest("[data-result-tag]");
      var reset = event.target.closest("[data-search-reset]");

      if (quickTag) {
        state.tag = quickTag.getAttribute("data-search-tag") || "";
        syncFilterButtons();
        requestSearch();
        track("search_quick_tag_click", { tag: state.tag });
      } else if (year) {
        state.year = year.getAttribute("data-filter-year") || "";
        syncFilterButtons();
        requestSearch();
      } else if (tag) {
        state.tag = tag.getAttribute("data-filter-tag") || "";
        syncFilterButtons();
        requestSearch();
      } else if (hint) {
        applyQuery(String(hint.getAttribute("data-search-hint") || "").split("↔")[0].trim());
      } else if (recent) {
        applyQuery(recent.getAttribute("data-recent-query") || "");
      } else if (synonym) {
        applyQuery(synonym.getAttribute("data-synonym-term") || "");
      } else if (emptyTag) {
        state.tag = emptyTag.getAttribute("data-empty-tag") || "";
        requestSearch();
      } else if (resultTag) {
        state.tag = resultTag.getAttribute("data-result-tag") || "";
        syncFilterButtons();
        requestSearch();
      } else if (reset) {
        resetSearch();
      }
    });

    if (recentClear) recentClear.addEventListener("click", function () {
      try { localStorage.removeItem(recentStorageKey); } catch (error) { return; }
      renderRecentSearches([]);
    });

    if (resultsRoot) {
      resultsRoot.addEventListener("pointerover", function (event) {
        var card = event.target.closest(".search-result-card");
        if (card) setActiveResult(Number(card.getAttribute("data-result-index") || 0), false);
      });
      resultsRoot.addEventListener("click", function (event) {
        var link = event.target.closest(".search-result-title a, .search-result-open");
        if (link && state.query) saveRecentSearch(state.query);
      });
    }

    if (loadMoreButton) loadMoreButton.addEventListener("click", function () {
      resultLimit += resultStep;
      performSearch({ preserveLimit: true });
    });

    document.addEventListener("keydown", function (event) {
      var active = document.activeElement;
      if (event.key === "/" && active !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(active && active.tagName || "")) {
        event.preventDefault();
        input.focus();
      }
      if (!active || !active.closest || !active.closest(".search-results")) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveResult(activeResultIndex + 1, true);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (activeResultIndex <= 0) input.focus();
        else setActiveResult(activeResultIndex - 1, true);
      }
    });
  }

  function initFromURL() {
    var params = new URLSearchParams(window.location.search);
    state.query = params.get("q") || "";
    state.year = params.get("year") || "";
    state.tag = params.get("tag") || "";
    state.autoJump = params.get("autojump") === "1";
    if (input) input.value = state.query;
    syncFilterButtons();
  }

  buildSynonymLookup();
  initFromURL();
  renderRecentSearches();
  bindEvents();
  performSearch();
})();
