# CLAUDE.md - Project Context for Claude Code

## Project Overview

This is a browser extension (Chrome/Brave) that summarizes webpages and YouTube videos using the OpenRouter API.

## Key Technical Details

### Architecture
- **Manifest V3** Chrome extension
- Service worker background script (not persistent)
- Popup UI for user interaction
- Options page for settings

### API Integration
- Uses OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`)
- Requires user-provided API key stored in `chrome.storage.local`
- Supports any model available on OpenRouter

### YouTube Transcript Extraction
This was the most complex feature. The extraction uses 6 fallback methods in `background.js:extractYouTubeTranscript()`:

1. **Method 1** (lines 152-161): Access `window.ytInitialPlayerResponse.captions`
2. **Method 2** (lines 164-179): Parse `captionTracks` from page HTML
3. **Method 3** (lines 182-184): Construct URL using video ID
4. **Method 4** (lines 224-236): Fetch without format parameter
5. **Method 5** (lines 239-252): Extract from `transcriptSegmentListRenderer`
6. **Method 6** (lines 255-306): Auto-click "Show Transcript" button and scrape DOM

**Important**: Uses `world: 'MAIN'` in `executeScript` to access YouTube's JavaScript variables.

### Persistence
Summaries are saved to `chrome.storage.local` keyed by URL, so they persist when the popup closes and reopens.

## Common Issues & Solutions

### "Transcript is empty"
- Usually means `ytInitialPlayerResponse` wasn't accessible
- Fixed by using `world: 'MAIN'` in executeScript

### "Could not extract text from captions"
- Caption URL found but parsing failed
- Added multiple format fallbacks (JSON3, XML)

### Summary disappears on popup close
- Fixed by saving to `chrome.storage.local` in both `background.js` (line 484-489) and checking on popup load in `popup.js` (line 42-45)

## File Locations

| Purpose | File |
|---------|------|
| API calls & content extraction | `background/background.js` |
| Popup UI logic | `popup/popup.js` |
| Settings management | `options/options.js` |
| Extension config | `manifest.json` |

## Styling

Currently using **Monochrome/Ultra Clean** theme:
- Primary: #171717 (near-black)
- Background: #ffffff
- Borders: #e5e5e5
- Secondary text: #737373

## Testing Changes

1. Make code changes
2. Go to `brave://extensions` or `chrome://extensions`
3. Click refresh icon on the extension card
4. Test on a webpage or YouTube video

## Regenerating Icons

If `logo.svg` is modified:
```bash
magick "C:/dev/open-router-summarizer/logo.svg" -resize 16x16 "C:/dev/open-router-summarizer/logo-16.png"
magick "C:/dev/open-router-summarizer/logo.svg" -resize 48x48 "C:/dev/open-router-summarizer/logo-48.png"
magick "C:/dev/open-router-summarizer/logo.svg" -resize 128x128 "C:/dev/open-router-summarizer/logo-128.png"
```

## Future Enhancement Ideas

- Add history of past summaries
- Export summaries to markdown/text file
- Keyboard shortcut to trigger summarization
- Support for PDF summarization
- Streaming responses for long summaries
- Dark mode toggle
