# GTA 6 Spoiler Blocker

A Chrome extension that blurs GTA 6 posts on **X (Twitter)** and **YouTube** so you can stay spoiler-free.

It blurs posts on your screen only; it can't delete anyone's posts from the site. Click a blurred post to reveal it.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Pin the extension and refresh any open X / YouTube tabs

Already installed an older version? Click the reload icon on the extension's card in `chrome://extensions`, then refresh your open X / YouTube tabs. Tabs you don't refresh keep running the old version until you do.

Chrome's **Errors** page keeps old errors until you delete them, and it shows today's code next to the line number from when the error happened. So an old error can look like it points at code that couldn't cause it. Delete old entries after updating.

## What it does

- Scans posts as they load (including infinite scroll) and blurs any that mention GTA 6, with a "click to reveal" label. Posts keep their full size, so the feed layout doesn't change; the blur covers the whole post, and clicking it removes the blur.
- Checks post text, quoted posts, link cards, hashtags and image alt text.
- On X it also blurs matching trends and search suggestions.
- Videos under the blur are paused, so a blurred clip can't play its audio. Revealing it starts it again.
- On YouTube it blurs matching videos on the home page, in search results, channel pages, the sidebar next to a video, playlists, Shorts shelves and notifications. It also blurs comment threads that mention GTA 6, and matching videos in the suggestions grid that appears when a video ends.
- The toolbar badge shows how many posts are blurred on the current tab.

## Keywords

Defaults: `gta 6`, `gta vi`, `gta6`, `gtavi` (plus uppercase versions), `grand theft auto 6/vi`, `vice city`, `leonida`, `lucia caminos`, `jason duval`, `port gellhorn`, `rockstar games`.

- Matching ignores case and separators: `gta 6` also matches `GTA6`, `#gta_6`, `GTA-6` and `#GTA6Spoilers`. It doesn't match `gta 60fps`.
- **Strict mode** also blocks `gta`, `rockstar`, `lucia`, `jason and lucia` and `trailer 3`. It catches more posts but has more false positives.
- You can edit the list in the popup, one keyword per line.

## Limitations

- Videos and images with no text or alt text can't be detected.
- On YouTube, the full-screen **Shorts** player, the video you're currently watching, and autoplay into the next video aren't blocked. Turning off autoplay helps.
- X and YouTube change their markup often. If posts start getting through, update the selectors in `RULES` in `src/content.js`.

## Development

```
node tests/matcher.test.js         # keyword matching tests
python3 -m http.server 8765        # then open http://localhost:8765/tests/fixture-x.html or fixture-youtube.html
python3 scripts/make_icons.py      # regenerate icons
```
