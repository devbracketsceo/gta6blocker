// Scans X and YouTube for GTA 6 posts and blurs them (click to reveal).
// Depends on matcher.js (loaded first via the manifest).

(() => {
  const { DEFAULT_KEYWORDS, STRICT_KEYWORDS, buildMatcher } = globalThis.GTA6Matcher;

  const host = location.hostname;
  // __GTA6_TEST_SITE lets the fixtures in tests/ pick a site; real pages can't set it
  // because content scripts run in an isolated world.
  const SITE = globalThis.__GTA6_TEST_SITE || (host.includes("youtube.com") ? "youtube" : "x");

  const DEFAULT_SETTINGS = {
    enabled: true,
    sites: { x: true, youtube: true },
    strict: false,
    keywords: DEFAULT_KEYWORDS,
  };

  // Each rule: which elements to inspect, and which element to blur.
  // Rules run in order and each container is handled once per scan, so list
  // outer wrappers before the elements nested inside them.
  // The kind picks the CSS used (see content.css). All of them keep the post's
  // size and put a blur layer over it; clicking removes the blur:
  //   "post"    -> feed posts, comments, list rows
  //   "tile"    -> grid tiles (shorter label)
  //   "overlay" -> elements the site positions itself (YouTube end-screen wall)
  const YT_WRAPPERS = "ytd-rich-item-renderer, ytd-reel-item-renderer";
  const RULES = {
    x: [
      {
        selector: 'article[data-testid="tweet"], article[data-testid="notification"]',
        container: (el) => el.closest('[data-testid="cellInnerDiv"]') || el,
        kind: "post",
      },
      { selector: '[data-testid="trend"]', container: (el) => el, kind: "post" },
      {
        selector: '[data-testid="typeaheadResult"]',
        container: (el) => el,
        kind: "post",
      },
    ],
    youtube: [
      {
        // Grid items (home, subscriptions, channel grids, Shorts shelves).
        selector: [
          "ytd-rich-item-renderer",
          "ytd-grid-video-renderer",
          "ytd-reel-item-renderer",
          "ytm-shorts-lockup-view-model",
          "ytm-shorts-lockup-view-model-v2",
        ].join(", "),
        container: (el) => el.closest(YT_WRAPPERS) || el,
        kind: "tile",
      },
      {
        // List rows (search results, sidebar, playlists, notifications).
        selector: [
          "ytd-video-renderer",
          "ytd-compact-video-renderer",
          "ytd-playlist-renderer",
          "ytd-radio-renderer",
          "ytd-channel-renderer",
          "ytd-movie-renderer",
          "ytd-playlist-video-renderer",
          "ytd-playlist-panel-video-renderer",
          "ytd-notification-renderer",
          // Newer "lockup" component used in the sidebar (inside grid items it's
          // already handled by the rule above).
          "yt-lockup-view-model",
        ].join(", "),
        container: (el) => el.closest(YT_WRAPPERS) || el,
        kind: "post",
      },
      // Comment threads (including replies).
      { selector: "ytd-comment-thread-renderer", container: (el) => el, kind: "post" },
      // End-of-video suggestion wall inside the player.
      { selector: ".ytp-videowall-still, .ytp-modern-videowall-still", container: (el) => el, kind: "overlay" },
    ],
  };

  // A stable id for the post inside a container (its permalink), used to notice
  // when a site reuses the same DOM element for a different post (YouTube does).
  const POST_LINK =
    'a[href*="/status/"], a[href*="watch?v="], a[href*="/shorts/"]';
  function postId(container) {
    const a = container.matches(POST_LINK) ? container : container.querySelector(POST_LINK);
    return (a && a.getAttribute("href")) || "";
  }

  let settings = DEFAULT_SETTINGS;
  let match = () => null;
  let active = false;
  let pageBlockedCount = 0;
  let pendingTotal = 0;

  // ---------- text extraction ----------

  function textOf(el) {
    // Join text nodes with spaces. textContent would glue neighbouring elements
    // together ("2h" + "GTA6 leak" -> "2hGTA6 leak"), and the keyword then
    // wouldn't start at a word boundary.
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue);
    let text = parts.join(" ");
    // Image alt text, labels, titles.
    el.querySelectorAll("img[alt], [aria-label], [title]").forEach((n) => {
      const alt = n.getAttribute("alt");
      const label = n.getAttribute("aria-label");
      const title = n.getAttribute("title");
      if (alt) text += " " + alt;
      if (label) text += " " + label;
      if (title) text += " " + title;
    });
    const links = el.matches("a[href]") ? [el, ...el.querySelectorAll("a[href]")] : el.querySelectorAll("a[href]");
    links.forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;
      // Links in tweets are often shortened; include the real hashtag/search target.
      if (/hashtag|explore\/tags|search\?q=/i.test(href)) {
        try {
          text += " " + decodeURIComponent(href);
        } catch (_) {
          text += " " + href;
        }
      }
      // The account a post belongs to (X permalinks are /<account>/status/<id>).
      const owner = /^\/([^/?#]+)\/status\//.exec(href);
      if (owner) text += " " + owner[1];
    });
    return text;
  }

  // Cheap signature so we only re-run the regex when a post's content changes.
  function signature(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return text.length + ":" + h;
  }

  // ---------- hiding ----------

  function block(container, kind, keyword) {
    const state = kind === "post" ? "blur" : kind;
    if (container.dataset.gta6Blocked === "revealed") return;
    if (!container.dataset.gta6Blocked) {
      pageBlockedCount++;
      pendingTotal++;
    }
    container.dataset.gta6Blocked = state;
    container.dataset.gta6Keyword = keyword;
    // The blur layer needs a positioned parent. Only add position: relative to
    // elements the site left static: X places every feed cell with
    // position: absolute + translateY, and overriding that pushes each blurred
    // post down the page and leaves a big empty gap.
    if (!container.dataset.gta6Pos) {
      container.dataset.gta6Pos = getComputedStyle(container).position === "static" ? "add" : "keep";
    }
    // Stop any video in it so a blurred clip can't play its audio.
    container.querySelectorAll("video").forEach(pauseVideo);
  }

  function pauseVideo(video) {
    if (!video.paused) {
      video.pause();
      video.dataset.gta6Paused = "1";
    }
  }

  // Sites restart videos as they scroll into view; keep blurred ones paused.
  // (Media events don't bubble, but a capturing listener on document sees them.)
  document.addEventListener(
    "play",
    (e) => {
      const video = e.target;
      if (video instanceof HTMLVideoElement && video.closest(BLURRED)) pauseVideo(video);
    },
    true
  );

  function unblock(container) {
    if (container.dataset.gta6Blocked && container.dataset.gta6Blocked !== "revealed") {
      pageBlockedCount = Math.max(0, pageBlockedCount - 1);
    }
    delete container.dataset.gta6Blocked;
    delete container.dataset.gta6Keyword;
    delete container.dataset.gta6Pos;
  }

  function resetAll() {
    document.querySelectorAll("[data-gta6-blocked], [data-gta6-sig]").forEach((el) => {
      delete el.dataset.gta6Blocked;
      delete el.dataset.gta6Keyword;
      delete el.dataset.gta6Pos;
      delete el.dataset.gta6Sig;
      delete el.dataset.gta6RevealedId;
    });
    pageBlockedCount = 0;
    reportCount();
  }

  const BLURRED = '[data-gta6-blocked="blur"], [data-gta6-blocked="tile"], [data-gta6-blocked="overlay"]';

  // Click on a blurred post reveals it (and swallows the click so the site doesn't navigate).
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? e.target.closest(BLURRED) : null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      target.dataset.gta6Blocked = "revealed";
      target.dataset.gta6RevealedId = postId(target);
      pageBlockedCount = Math.max(0, pageBlockedCount - 1);
      reportCount();
      // Resume any video we paused, so a revealed clip plays as normal.
      target.querySelectorAll('video[data-gta6-paused="1"]').forEach((v) => {
        delete v.dataset.gta6Paused;
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      });
    },
    true
  );

  // ---------- extension lifecycle ----------

  // When the extension is reloaded or updated, the copy of this script already
  // running in open tabs is cut off: chrome.storage and chrome.runtime stop
  // working and calling them throws. Detect that and shut this copy down.
  // Posts it already blurred stay blurred; refreshing the tab loads the new copy.
  function extensionAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local && chrome.storage.sync);
    } catch (_) {
      return false;
    }
  }

  let dead = false;
  function shutdown() {
    dead = true;
    active = false;
    observer.disconnect();
  }

  // Runs a chrome.* call, shutting down instead of throwing if the extension is gone.
  function safely(fn) {
    if (dead) return;
    if (!extensionAlive()) return shutdown();
    try {
      fn();
    } catch (_) {
      shutdown();
    }
  }

  // ---------- scanning ----------

  function scan() {
    if (!active) return;
    if (!extensionAlive()) return shutdown();
    const before = pageBlockedCount;
    const seen = new Set();
    for (const rule of RULES[SITE]) {
      document.querySelectorAll(rule.selector).forEach((el) => {
        const container = rule.container(el);
        if (!container || seen.has(container)) return;
        seen.add(container);
        const text = textOf(container);
        const sig = signature(text);
        if (container.dataset.gta6Sig === sig) return; // unchanged since last check
        container.dataset.gta6Sig = sig;
        if (container.dataset.gta6Blocked === "revealed") {
          // Keep it revealed unless the element now holds a different post.
          const id = postId(container);
          if (!id || id === container.dataset.gta6RevealedId) return;
          delete container.dataset.gta6Blocked;
          delete container.dataset.gta6RevealedId;
        }
        const keyword = match(text);
        if (keyword) block(container, rule.kind, keyword);
        else if (container.dataset.gta6Blocked) unblock(container);
      });
    }
    // Drop blurs from elements that no longer count as a post, so a stale blur
    // can't sit over content that has changed underneath it.
    document.querySelectorAll(BLURRED).forEach((el) => {
      if (seen.has(el)) return;
      unblock(el);
      delete el.dataset.gta6Sig;
    });
    if (pageBlockedCount !== before) reportCount();
    flushTotal();
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 150);
  }

  const observer = new MutationObserver(scheduleScan);

  // ---------- messaging / stats ----------

  function reportCount() {
    safely(() => {
      chrome.runtime.sendMessage({ type: "gta6-count", count: active ? pageBlockedCount : 0 }, () => {
        void chrome.runtime.lastError; // no listener yet (service worker asleep) is fine
      });
    });
  }

  let flushTimer = null;
  function flushTotal() {
    if (!pendingTotal || flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const add = pendingTotal;
      pendingTotal = 0;
      safely(() => {
        chrome.storage.local.get({ totalBlocked: 0 }, (res) => {
          safely(() => chrome.storage.local.set({ totalBlocked: ((res && res.totalBlocked) || 0) + add }));
        });
      });
    }, 1000);
  }

  safely(() =>
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === "gta6-get-count") {
        sendResponse({ count: active ? pageBlockedCount : 0, site: SITE, active });
      }
    })
  );

  // ---------- settings ----------

  function applySettings(raw) {
    if (dead) return;
    settings = {
      ...DEFAULT_SETTINGS,
      ...raw,
      sites: { ...DEFAULT_SETTINGS.sites, ...(raw && raw.sites) },
    };
    const keywords = [...(settings.keywords || [])];
    if (settings.strict) keywords.push(...STRICT_KEYWORDS);
    match = buildMatcher(keywords);
    active = !!(settings.enabled && settings.sites[SITE]);

    resetAll();
    if (active) {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      scan();
    } else {
      observer.disconnect();
    }
  }

  function loadSettings() {
    safely(() => chrome.storage.sync.get(DEFAULT_SETTINGS, applySettings));
  }

  loadSettings();
  safely(() =>
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === "sync") loadSettings();
    })
  );
})();
