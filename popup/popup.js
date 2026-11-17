const { DEFAULT_KEYWORDS } = globalThis.GTA6Matcher;

const DEFAULT_SETTINGS = {
  enabled: true,
  sites: { x: true, youtube: true },
  strict: false,
  keywords: DEFAULT_KEYWORDS,
};

const $ = (id) => document.getElementById(id);
let settings = DEFAULT_SETTINGS;

function save(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.sync.set(settings);
  render();
}

function render() {
  $("enabled").checked = settings.enabled;
  $("site-x").checked = settings.sites.x;
  $("site-youtube").checked = settings.sites.youtube;
  $("strict").checked = settings.strict;
  document.body.classList.toggle("off", !settings.enabled);
  $("status").textContent = settings.enabled ? "Blurring GTA 6 posts" : "Paused";
}

function parseKeywords(text) {
  const seen = new Set();
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

function flashSaved() {
  const el = $("saved");
  el.hidden = false;
  clearTimeout(flashSaved.t);
  flashSaved.t = setTimeout(() => (el.hidden = true), 1500);
}

chrome.storage.sync.remove("mode");
chrome.storage.sync.get(DEFAULT_SETTINGS, (s) => {
  const { mode: _oldMode, ...rest } = s; // "mode" was removed in 1.2 (blur is the only mode)
  settings = { ...DEFAULT_SETTINGS, ...rest, sites: { ...DEFAULT_SETTINGS.sites, ...rest.sites } };
  $("keywords").value = settings.keywords.join("\n");
  render();
});

chrome.storage.local.get({ totalBlocked: 0 }, ({ totalBlocked }) => {
  $("totalCount").textContent = totalBlocked.toLocaleString();
});

// Ask the current tab's content script how many posts it's blurring.
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: "gta6-get-count" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      $("pageCount").textContent = "–";
      $("pageCount").title = "Open X or YouTube to see this";
      return;
    }
    $("pageCount").textContent = res.count;
  });
});

$("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
$("site-x").addEventListener("change", (e) => save({ sites: { ...settings.sites, x: e.target.checked } }));
$("site-youtube").addEventListener("change", (e) => save({ sites: { ...settings.sites, youtube: e.target.checked } }));
$("strict").addEventListener("change", (e) => save({ strict: e.target.checked }));

$("save").addEventListener("click", () => {
  const keywords = parseKeywords($("keywords").value);
  $("keywords").value = keywords.join("\n");
  save({ keywords });
  flashSaved();
});

$("reset").addEventListener("click", () => {
  $("keywords").value = DEFAULT_KEYWORDS.join("\n");
  save({ keywords: DEFAULT_KEYWORDS });
  flashSaved();
});
