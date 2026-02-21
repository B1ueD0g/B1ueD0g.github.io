(function () {
  if (window.BlueDogShareSheetReady) return;
  window.BlueDogShareSheetReady = true;

  var ua = navigator.userAgent || "";
  if (/MicroMessenger/i.test(ua)) return;

  function showToast(message, tone) {
    if (typeof window.BlueDogShowToast === "function") {
      window.BlueDogShowToast(message, tone);
      return;
    }

    var toast = document.getElementById("copy-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("is-error", "is-success");
    toast.classList.add(tone === "error" ? "is-error" : "is-success", "is-visible");
    window.clearTimeout(window.__bdToastTimer);
    window.__bdToastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 1700);
  }

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

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function openPopup(url) {
    window.open(url, "_blank", "noopener,noreferrer,width=720,height=620");
  }

  function getSharePayload(root) {
    var rawTitle = root.getAttribute("data-share-title") || document.title || "";
    var rawUrl = root.getAttribute("data-share-url") || window.location.href || "";
    var title = rawTitle.trim();
    var url = rawUrl;
    try {
      url = new URL(rawUrl, window.location.origin).href.split("#")[0];
    } catch (error) {
      url = window.location.href.split("#")[0];
    }
    return { title: title, url: url };
  }

  function hasOpenSheet() {
    return Boolean(document.querySelector(".bd-share[data-share-opened='true']"));
  }

  function syncBodyLock() {
    document.body.classList.toggle("bd-share-opened", hasOpenSheet());
  }

  function openSheet(root) {
    var sheet = root.querySelector("[data-share-sheet]");
    if (!sheet) return;
    sheet.hidden = false;
    root.dataset.shareOpened = "true";
    var trigger = root.querySelector("[data-share-open]");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    syncBodyLock();
  }

  function closeSheet(root) {
    var sheet = root.querySelector("[data-share-sheet]");
    if (!sheet) return;
    sheet.hidden = true;
    delete root.dataset.shareOpened;
    var trigger = root.querySelector("[data-share-open]");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    syncBodyLock();
  }

  function closeAllSheets() {
    document.querySelectorAll(".bd-share[data-share-root]").forEach(function (root) {
      closeSheet(root);
    });
  }

  function handleShareAction(root, action) {
    var payload = getSharePayload(root);
    var encodedUrl = encodeURIComponent(payload.url);
    var encodedTitle = encodeURIComponent(payload.title);

    if (typeof window.BlueDogTrack === "function") {
      window.BlueDogTrack("share_click", { channel: action });
    }

    if (action === "x") {
      openPopup("https://x.com/intent/tweet?url=" + encodedUrl + "&text=" + encodedTitle);
      closeSheet(root);
      return;
    }
    if (action === "facebook") {
      openPopup("https://www.facebook.com/sharer/sharer.php?u=" + encodedUrl);
      closeSheet(root);
      return;
    }
    if (action === "linkedin") {
      openPopup("https://www.linkedin.com/sharing/share-offsite/?url=" + encodedUrl);
      closeSheet(root);
      return;
    }
    if (action === "copy") {
      copyText(payload.url).then(function (ok) {
        showToast(ok ? "链接已复制" : "复制失败，请手动复制", ok ? "success" : "error");
      });
      closeSheet(root);
      return;
    }
  }

  document.addEventListener("click", function (event) {
    var openBtn = event.target.closest("[data-share-open]");
    if (openBtn) {
      var openRoot = openBtn.closest("[data-share-root]");
      if (!openRoot) return;
      if (openRoot.dataset.shareOpened === "true") {
        closeSheet(openRoot);
      } else {
        closeAllSheets();
        openSheet(openRoot);
      }
      return;
    }

    var closeBtn = event.target.closest("[data-share-close]");
    if (closeBtn) {
      var closeRoot = closeBtn.closest("[data-share-root]");
      if (closeRoot) closeSheet(closeRoot);
      return;
    }

    var actionBtn = event.target.closest("[data-share-action]");
    if (actionBtn) {
      var actionRoot = actionBtn.closest("[data-share-root]");
      if (!actionRoot) return;
      handleShareAction(actionRoot, actionBtn.getAttribute("data-share-action"));
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    closeAllSheets();
  });
})();
