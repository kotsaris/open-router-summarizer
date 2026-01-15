// OpenRouter API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

// Default settings
const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'anthropic/claude-3.5-sonnet',
  language: 'English',
  customPrompt: `Summarize the following content in clear, concise bullet points.
Use appropriate emojis for each bullet point.
Respond in {{LANGUAGE}}.

Content to summarize:
{{CONTENT}}`
};

// Get settings from storage
async function getSettings() {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return result;
}

// Save settings to storage
async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

// Fetch available models from OpenRouter
async function fetchModels(apiKey) {
  if (!apiKey) {
    throw new Error('API key is required');
  }

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': chrome.runtime.getURL(''),
      'X-Title': 'OpenRouter Summarizer'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch models');
  }

  const data = await response.json();
  return data.data || [];
}

// Call OpenRouter API for summarization
async function summarize(content, settings, isYouTube = false) {
  if (!settings.apiKey) {
    throw new Error('Please configure your OpenRouter API key in the extension options');
  }

  // Use a slightly different prompt for YouTube transcripts
  let prompt = settings.customPrompt;
  if (isYouTube) {
    prompt = prompt.replace('Content to summarize:', 'Video transcript to summarize:');
  }

  prompt = prompt
    .replace('{{CONTENT}}', content)
    .replace('{{LANGUAGE}}', settings.language);

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
      'HTTP-Referer': chrome.runtime.getURL(''),
      'X-Title': 'OpenRouter Summarizer'
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'No summary generated';
}

// Check if URL is a YouTube video page
function isYouTubeVideo(url) {
  try {
    const urlObj = new URL(url);
    return (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com')
      && urlObj.pathname === '/watch'
      && urlObj.searchParams.has('v');
  } catch {
    return false;
  }
}

// Extract YouTube video ID from URL
function getYouTubeVideoId(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v');
  } catch {
    return null;
  }
}

// Extract YouTube transcript from page
async function extractYouTubeTranscript(tabId) {
  // First, get the video ID from the tab URL
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const videoUrl = tabs[0]?.url || '';
  const videoId = getYouTubeVideoId(videoUrl);

  if (!videoId) {
    return { error: 'Could not get video ID', isYouTube: true };
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [videoId],
    func: async (videoId) => {
      const title = document.title.replace(' - YouTube', '');
      const url = window.location.href;

      // Helper to decode HTML entities
      function decodeHtmlEntities(text) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
      }

      try {
        let transcript = '';
        let captionLanguage = 'Unknown';

        // Method 1: Get captions URL from ytInitialPlayerResponse
        let captionUrl = null;

        if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
          const track = tracks.find(t => t.languageCode === 'en') ||
                       tracks.find(t => t.languageCode?.startsWith('en')) ||
                       tracks[0];
          if (track) {
            captionUrl = track.baseUrl;
            captionLanguage = track.name?.simpleText || track.languageCode || 'Auto';
          }
        }

        // Method 2: Search in page HTML for caption tracks
        if (!captionUrl) {
          const html = document.documentElement.innerHTML;
          const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
          if (captionMatch) {
            try {
              const tracks = JSON.parse(captionMatch[1]);
              const track = tracks.find(t => t.languageCode === 'en') ||
                           tracks.find(t => t.languageCode?.startsWith('en')) ||
                           tracks[0];
              if (track?.baseUrl) {
                captionUrl = track.baseUrl;
                captionLanguage = track.name?.simpleText || track.languageCode || 'Auto';
              }
            } catch (e) {}
          }
        }

        // Method 3: Try to construct URL using video ID
        if (!captionUrl) {
          // This is a fallback - may not always work
          captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;
        }

        if (!captionUrl) {
          throw new Error('No captions available for this video');
        }

        // Fetch captions - try JSON3 format
        let response = await fetch(captionUrl + (captionUrl.includes('?') ? '&' : '?') + 'fmt=json3');

        if (response.ok) {
          const text = await response.text();
          if (text && text.trim()) {
            try {
              const data = JSON.parse(text);
              if (data.events) {
                for (const event of data.events) {
                  if (event.segs) {
                    for (const seg of event.segs) {
                      if (seg.utf8) {
                        transcript += seg.utf8;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              // Not JSON, try as XML
              if (text.includes('<text')) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                doc.querySelectorAll('text').forEach(el => {
                  transcript += decodeHtmlEntities(el.textContent || '') + ' ';
                });
              }
            }
          }
        }

        // Method 4: Try fetching without format parameter
        if (!transcript.trim()) {
          response = await fetch(captionUrl);
          if (response.ok) {
            const text = await response.text();
            if (text.includes('<text')) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(text, 'text/xml');
              doc.querySelectorAll('text').forEach(el => {
                transcript += decodeHtmlEntities(el.textContent || '') + ' ';
              });
            }
          }
        }

        // Method 5: Extract from YouTube's embedded transcript data in page
        if (!transcript.trim()) {
          const html = document.documentElement.innerHTML;
          // Look for transcript segments in initial data
          const segmentMatch = html.match(/"transcriptSegmentListRenderer".*?"segments":\s*(\[.*?\])\s*}/s);
          if (segmentMatch) {
            try {
              const segments = JSON.parse(segmentMatch[1]);
              for (const seg of segments) {
                const text = seg?.transcriptSegmentRenderer?.snippet?.runs?.[0]?.text;
                if (text) transcript += text + ' ';
              }
            } catch (e) {}
          }
        }

        // Method 6: Click "Show Transcript" button and grab from DOM
        if (!transcript.trim()) {
          // Try to open the transcript panel
          try {
            // First, expand the description if needed
            const expandBtn = document.querySelector('tp-yt-paper-button#expand');
            if (expandBtn) {
              expandBtn.click();
              await new Promise(r => setTimeout(r, 300));
            }

            // Look for "Show transcript" button in the description
            const buttons = document.querySelectorAll('ytd-video-description-transcript-section-renderer button, button.yt-spec-button-shape-next');
            for (const btn of buttons) {
              if (btn.textContent?.toLowerCase().includes('transcript')) {
                btn.click();
                await new Promise(r => setTimeout(r, 1000)); // Wait for panel to load
                break;
              }
            }

            // Also try the menu approach (three dots menu)
            if (!document.querySelector('ytd-transcript-segment-renderer')) {
              const menuBtn = document.querySelector('button.ytp-button[aria-label="More actions"]') ||
                             document.querySelector('ytd-menu-renderer button[aria-label="More actions"]') ||
                             document.querySelector('ytd-button-renderer.ytd-menu-renderer button');
              if (menuBtn) {
                menuBtn.click();
                await new Promise(r => setTimeout(r, 300));

                const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
                for (const item of menuItems) {
                  if (item.textContent?.toLowerCase().includes('transcript')) {
                    item.click();
                    await new Promise(r => setTimeout(r, 1000));
                    break;
                  }
                }
              }
            }
          } catch (e) {
            console.log('Could not auto-open transcript:', e);
          }

          // Now try to get transcript from the panel
          await new Promise(r => setTimeout(r, 500)); // Extra wait for content to load

          document.querySelectorAll('ytd-transcript-segment-renderer').forEach(el => {
            const text = el.querySelector('yt-formatted-string.segment-text')?.textContent ||
                        el.querySelector('.segment-text')?.textContent;
            if (text) transcript += text + ' ';
          });
        }

        // Clean up transcript
        transcript = transcript
          .replace(/\[.*?\]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!transcript) {
          throw new Error('Could not extract transcript. Try opening the transcript panel manually (click "..." below the video, then "Show transcript") and try again.');
        }

        // Limit transcript length
        const maxLength = 15000;
        if (transcript.length > maxLength) {
          transcript = transcript.substring(0, maxLength) + '...';
        }

        return {
          title,
          content: transcript,
          url,
          isYouTube: true,
          captionLanguage: captionLanguage
        };

      } catch (error) {
        return {
          title,
          url,
          error: error.message,
          isYouTube: true
        };
      }
    }
  });

  return results[0]?.result || { title: '', content: '', url: '', error: 'Script execution failed' };
}

// Extract page content using scripting API
async function extractPageContent(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Get page title
      const title = document.title;

      // Get main content - try common content selectors first
      const selectors = [
        'article',
        'main',
        '[role="main"]',
        '.post-content',
        '.article-content',
        '.entry-content',
        '#content',
        '.content'
      ];

      let content = '';

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.innerText.trim().length > 100) {
          content = element.innerText;
          break;
        }
      }

      // Fallback to body text if no content container found
      if (!content) {
        // Remove script, style, nav, header, footer elements
        const clone = document.body.cloneNode(true);
        const removeElements = clone.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .nav, .menu, .advertisement, .ads');
        removeElements.forEach(el => el.remove());
        content = clone.innerText;
      }

      // Clean up whitespace
      content = content.replace(/\s+/g, ' ').trim();

      // Limit content length (OpenRouter has token limits)
      const maxLength = 15000;
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + '...';
      }

      return { title, content, url: window.location.href, isYouTube: false };
    }
  });

  return results[0]?.result || { title: '', content: '', url: '', isYouTube: false };
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.action === 'saveSettings') {
    saveSettings(message.settings).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'fetchModels') {
    fetchModels(message.apiKey)
      .then(models => sendResponse({ models }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.action === 'checkPage') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (tab) {
          sendResponse({
            isYouTube: isYouTubeVideo(tab.url),
            url: tab.url
          });
        } else {
          sendResponse({ isYouTube: false });
        }
      } catch (error) {
        sendResponse({ isYouTube: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'summarize') {
    (async () => {
      try {
        const settings = await getSettings();
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab?.id) {
          throw new Error('No active tab found');
        }

        let pageContent;
        const isYouTube = isYouTubeVideo(tab.url);

        if (isYouTube) {
          // Extract YouTube transcript
          pageContent = await extractYouTubeTranscript(tab.id);

          if (pageContent.error) {
            throw new Error(`YouTube transcript error: ${pageContent.error}`);
          }
        } else {
          // Extract regular page content
          pageContent = await extractPageContent(tab.id);
        }

        if (!pageContent.content) {
          throw new Error(isYouTube
            ? 'Could not extract video transcript. The video may not have captions available.'
            : 'Could not extract page content');
        }

        const summary = await summarize(pageContent.content, settings, isYouTube);

        const result = {
          success: true,
          summary,
          title: pageContent.title,
          url: pageContent.url,
          isYouTube: pageContent.isYouTube,
          captionLanguage: pageContent.captionLanguage
        };

        // Save to storage so popup can retrieve it even if closed during summarization
        await chrome.storage.local.set({
          lastSummary: {
            ...result,
            timestamp: Date.now()
          }
        });

        sendResponse(result);
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }
});

console.log('OpenRouter Summarizer background service worker loaded');
