# OpenRouter Summarizer

A browser extension that summarizes webpages and YouTube videos using AI models via the OpenRouter API.

## Features

- Summarize any webpage content with one click
- Extract and summarize YouTube video transcripts automatically
- Support for multiple AI models through OpenRouter (Claude, GPT-4, DeepSeek, Gemini, etc.)
- Customizable summary language
- Customizable prompt template
- Persistent summaries (survives popup close/reopen)
- Clean monochrome UI design

## Installation

1. Open Brave/Chrome and navigate to `brave://extensions` or `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `open-router-summarizer` folder

## Setup

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Click the extension icon, then the settings gear
3. Paste your API key and select a model
4. Optionally customize the language and prompt template

## Recommended Models (Best Value)

- **DeepSeek V3** (`deepseek/deepseek-chat`) - Excellent quality, very affordable
- **Gemini 1.5 Flash** (`google/gemini-flash-1.5`) - Fast and cheap
- **Claude 3.5 Haiku** (`anthropic/claude-3.5-haiku`) - Good balance of speed/quality

## File Structure

```
open-router-summarizer/
├── manifest.json          # Extension manifest (Manifest V3)
├── background/
│   └── background.js      # Service worker - API calls, content extraction
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styles (monochrome theme)
│   └── popup.js           # Popup logic
├── options/
│   ├── options.html       # Settings page
│   ├── options.css        # Settings styles
│   └── options.js         # Settings logic
├── logo.svg               # Vector icon source
├── logo-16.png            # 16x16 icon
├── logo-48.png            # 48x48 icon
└── logo-128.png           # 128x128 icon
```

## How It Works

### Webpage Summarization
1. Extracts main content using common selectors (`article`, `main`, `.content`, etc.)
2. Falls back to cleaned body text if no content container found
3. Sends to OpenRouter API with customizable prompt

### YouTube Transcript Extraction
Uses multiple fallback methods:
1. `ytInitialPlayerResponse.captions` - YouTube's player data
2. HTML parsing for `captionTracks` JSON
3. Direct caption URL construction
4. Auto-clicking "Show Transcript" button in description
5. DOM scraping from transcript panel

## Customization

### Prompt Template Variables
- `{{CONTENT}}` - Replaced with page/video content
- `{{LANGUAGE}}` - Replaced with selected language

### Default Prompt
```
Summarize the following content in clear, concise bullet points.
Use appropriate emojis for each bullet point.
Respond in {{LANGUAGE}}.

Content to summarize:
{{CONTENT}}
```

## Development

The extension uses Chrome Extension Manifest V3 with:
- Service worker for background processing
- `chrome.scripting.executeScript` with `world: 'MAIN'` for YouTube data access
- `chrome.storage.local` for settings and summary persistence

## License

MIT
