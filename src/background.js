// Shows the number of hidden posts on the toolbar icon, per tab.

chrome.action.setBadgeBackgroundColor({ color: "#d6336c" });

chrome.runtime.onMessage.addListener((msg, sender) => {
	if (!msg || msg.type !== "gta6-count" || !sender.tab) return;
	const text = msg.count > 0 ? (msg.count > 999 ? "999+" : String(msg.count)) : "";
	chrome.action.setBadgeText({ tabId: sender.tab.id, text });
});
