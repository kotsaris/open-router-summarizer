document.addEventListener('DOMContentLoaded', async () => {
  const summarizeBtn = document.getElementById('summarize-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const openSettingsBtn = document.getElementById('open-settings');
  const languageSelect = document.getElementById('language');
  const noApiKeyDiv = document.getElementById('no-api-key');
  const mainContent = document.getElementById('main-content');
  const errorDiv = document.getElementById('error');
  const resultDiv = document.getElementById('result');
  const pageTitleEl = document.getElementById('page-title');
  const summaryEl = document.getElementById('summary');
  const copyBtn = document.getElementById('copy-btn');
  const youtubeIndicator = document.getElementById('youtube-indicator');
  const sourceBadge = document.getElementById('source-badge');
  const btnText = summarizeBtn.querySelector('.btn-text');

  // Load settings
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

  // Check if API key is configured
  if (!settings.apiKey) {
    noApiKeyDiv.style.display = 'block';
    mainContent.querySelector('.controls').style.display = 'none';
    summarizeBtn.style.display = 'none';
  }

  // Set saved language
  if (settings.language) {
    languageSelect.value = settings.language;
  }

  // Check if current page is YouTube
  const pageInfo = await chrome.runtime.sendMessage({ action: 'checkPage' });
  const currentUrl = pageInfo.url;

  if (pageInfo.isYouTube) {
    youtubeIndicator.style.display = 'flex';
    btnText.textContent = 'Summarize This Video';
  }

  // Load cached summary for current page
  const cached = await chrome.storage.local.get(['lastSummary']);
  if (cached.lastSummary && cached.lastSummary.url === currentUrl) {
    displaySummary(cached.lastSummary);
  }

  // Function to display summary
  function displaySummary(data) {
    if (data.isYouTube) {
      sourceBadge.textContent = data.captionLanguage
        ? `YouTube Transcript (${data.captionLanguage})`
        : 'YouTube Transcript';
      sourceBadge.className = 'source-badge youtube';
    } else {
      sourceBadge.textContent = 'Webpage';
      sourceBadge.className = 'source-badge webpage';
    }
    sourceBadge.style.display = 'inline-flex';
    pageTitleEl.textContent = data.title || 'Summary';
    summaryEl.textContent = data.summary;
    resultDiv.style.display = 'block';
  }

  // Function to save summary
  async function saveSummary(data) {
    await chrome.storage.local.set({
      lastSummary: {
        url: data.url,
        title: data.title,
        summary: data.summary,
        isYouTube: data.isYouTube,
        captionLanguage: data.captionLanguage,
        timestamp: Date.now()
      }
    });
  }

  // Open settings page
  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  settingsBtn.addEventListener('click', openSettings);
  openSettingsBtn?.addEventListener('click', openSettings);

  // Save language preference
  languageSelect.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: { language: languageSelect.value }
    });
  });

  // Summarize button click
  summarizeBtn.addEventListener('click', async () => {
    const btnLoading = summarizeBtn.querySelector('.btn-loading');

    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
    summarizeBtn.disabled = true;
    errorDiv.style.display = 'none';
    resultDiv.style.display = 'none';

    // Save loading state so it persists if popup closes
    await chrome.storage.local.set({ summarizing: true, summarizingUrl: currentUrl });

    try {
      const response = await chrome.runtime.sendMessage({ action: 'summarize' });

      if (response.error) {
        throw new Error(response.error);
      }

      // Save and display the summary
      await saveSummary(response);
      displaySummary(response);

    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.style.display = 'block';
    } finally {
      // Reset button state
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      summarizeBtn.disabled = false;
      await chrome.storage.local.remove(['summarizing', 'summarizingUrl']);
    }
  });

  // Copy summary
  copyBtn.addEventListener('click', async () => {
    const summary = summaryEl.textContent;
    await navigator.clipboard.writeText(summary);

    // Show feedback
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  });
});
