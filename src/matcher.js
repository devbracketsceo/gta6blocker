// Keyword matching shared by the content script and the popup.
// Exposed as a global (content scripts can't use ES modules) and as a
// CommonJS export so it can be unit-tested in Node.

(function (root) {
	// Separators are optional when matching, so "gta 6" also covers "GTA6", "#gta_6", etc.
	const DEFAULT_KEYWORDS = [
		"gta 6",
		"gta vi",
		"gta6",
		"gtavi",
		"GTA 6",
		"GTA VI",
		"GTA6",
		"GTAVI",
		"grand theft auto 6",
		"grand theft auto vi",
		"vice city",
		"leonida",
		"lucia caminos",
		"jason duval",
		"port gellhorn",
		"rockstar games",
	];

	// Optional "strict" extras that are more likely to cause false positives.
	const STRICT_KEYWORDS = ["gta", "rockstar", "lucia", "jason and lucia", "trailer 3"];

	function escapeRegex(s) {
		return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	// Turn one keyword into a regex source.
	//  - spaces/dashes/underscores/dots in the keyword match any (or no) separator,
	//    so "gta 6" also matches "GTA6", "gta-6", "GTA_6" and "gta.6".
	//  - must not start in the middle of a word ("vgta6" is skipped,
	//    but "#gta6" and "@gta6" still match because # and @ aren't letters).
	//  - if the keyword ends in a digit, only another digit may follow
	//    ("#GTA6Spoilers" matches, "gta60" doesn't); otherwise it must end at a word boundary.
	function keywordToSource(keyword) {
		const k = keyword.trim().toLowerCase();
		if (!k) return null;
		const parts = k
			.split(/[\s\-_]+/)
			.filter(Boolean)
			.map(escapeRegex);
		const body = parts.join("[\\s\\-_.]*");
		const lastChar = k[k.length - 1];
		const tail = /\d/.test(lastChar) ? "(?!\\d)" : /[a-z0-9]/.test(lastChar) ? "(?![a-z0-9])" : "";
		const head = /^[a-z0-9]/.test(k) ? "(?<![a-z0-9])" : "";
		return head + body + tail;
	}

	function buildMatcher(keywords) {
		const sources = [];
		const labels = [];
		for (const kw of keywords || []) {
			const src = keywordToSource(String(kw));
			if (src) {
				sources.push("(" + src + ")");
				labels.push(String(kw).trim());
			}
		}
		if (!sources.length) return () => null;
		const re = new RegExp(sources.join("|"), "i");
		return function match(text) {
			if (!text) return null;
			// Normalise fancy unicode (full-width chars, roman numeral Ⅵ, etc.).
			const normalised = text.normalize("NFKC");
			const m = re.exec(normalised);
			if (!m) return null;
			for (let i = 1; i < m.length; i++) if (m[i] !== undefined) return labels[i - 1];
			return m[0];
		};
	}

	const api = { DEFAULT_KEYWORDS, STRICT_KEYWORDS, buildMatcher, keywordToSource };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	root.GTA6Matcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
