# Browser checks

The unit tests do not require a Bilibili account. Before releasing a browser build, check the following in Chrome and Firefox:

1. Open the Bilibili home page and a video page. Hover over a recommendation and confirm the action buttons are visible and do not obstruct playback.
2. Block a video and an uploader. Reload the page; the rules should persist. Enable "显示被过滤的视频" to inspect hidden cards.
3. Disable the extension from its popup. Previously filtered cards must reappear without a page reload.
4. With tracking enabled, play a video for more than 10 seconds. Check that the dashboard records the real watch time without duplicating entries after reload.
5. Change modes, adjust topic weights, save a named snapshot, then restore it. Export a backup, clear some records and import it back.
6. Open "内容探索" and fetch public videos. If an API returns HTTP 412 or another error, the interface must show the error instead of reporting success. Confirm the fallback links work.
7. Navigate between Bilibili pages without reloading; filtering and watch tracking should continue functioning.

The extension does not automate clicks, change account preferences, clear Bilibili history or send local watch data to external services.
