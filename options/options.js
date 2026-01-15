const DEFAULT_PROMPT = `Summarize the following content in clear, concise bullet points.
Use appropriate emojis for each bullet point.
Respond in {{LANGUAGE}}.

Content to summarize:
{{CONTENT}}`;

// Popular models to show at the top
const POPULAR_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'anthropic/claude-3-haiku',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4-turbo',
  'google/gemini-pro-1.5',
  'meta-llama/llama-3.1-405b-instruct',
  'mistralai/mistral-large'
];

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settings-form');
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const customPromptInput = document.getElementById('custom-prompt');
  const refreshModelsBtn = document.getElementById('refresh-models');
  const resetPromptBtn = document.getElementById('reset-prompt');
  const toast = document.getElementById('toast');

  // Load current settings
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

  apiKeyInput.value = settings.apiKey || '';
  customPromptInput.value = settings.customPrompt || DEFAULT_PROMPT;

  // Load models if API key exists
  if (settings.apiKey) {
    await loadModels(settings.apiKey, settings.model);
  } else {
    modelSelect.innerHTML = '<option value="">Enter API key first</option>';
  }

  // Load models from OpenRouter
  async function loadModels(apiKey, selectedModel = '') {
    modelSelect.innerHTML = '<option value="">Loading models...</option>';
    modelSelect.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'fetchModels',
        apiKey: apiKey
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const models = response.models;

      // Sort models: popular ones first, then alphabetically
      models.sort((a, b) => {
        const aPopular = POPULAR_MODELS.indexOf(a.id);
        const bPopular = POPULAR_MODELS.indexOf(b.id);

        if (aPopular !== -1 && bPopular !== -1) {
          return aPopular - bPopular;
        }
        if (aPopular !== -1) return -1;
        if (bPopular !== -1) return 1;

        return a.id.localeCompare(b.id);
      });

      // Build options HTML
      let optionsHtml = '';

      // Add popular models group
      const popularModels = models.filter(m => POPULAR_MODELS.includes(m.id));
      if (popularModels.length > 0) {
        optionsHtml += '<optgroup label="Popular Models">';
        for (const model of popularModels) {
          const selected = model.id === selectedModel ? 'selected' : '';
          const price = formatPrice(model);
          optionsHtml += `<option value="${model.id}" ${selected}>${model.name || model.id} ${price}</option>`;
        }
        optionsHtml += '</optgroup>';
      }

      // Add all models group
      optionsHtml += '<optgroup label="All Models">';
      for (const model of models) {
        if (!POPULAR_MODELS.includes(model.id)) {
          const selected = model.id === selectedModel ? 'selected' : '';
          const price = formatPrice(model);
          optionsHtml += `<option value="${model.id}" ${selected}>${model.name || model.id} ${price}</option>`;
        }
      }
      optionsHtml += '</optgroup>';

      modelSelect.innerHTML = optionsHtml;
      modelSelect.disabled = false;

      // If no model selected, select the first popular one
      if (!selectedModel && popularModels.length > 0) {
        modelSelect.value = popularModels[0].id;
      }

    } catch (error) {
      modelSelect.innerHTML = `<option value="">Error: ${error.message}</option>`;
      showToast('Failed to load models: ' + error.message, true);
    }
  }

  // Format price for display
  function formatPrice(model) {
    if (model.pricing) {
      const promptPrice = parseFloat(model.pricing.prompt) * 1000000;
      if (promptPrice > 0) {
        return `($${promptPrice.toFixed(2)}/1M tokens)`;
      }
    }
    return '';
  }

  // Refresh models button
  refreshModelsBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showToast('Please enter your API key first', true);
      return;
    }
    await loadModels(apiKey, modelSelect.value);
    showToast('Models refreshed');
  });

  // API key change - auto load models
  let apiKeyTimeout;
  apiKeyInput.addEventListener('input', () => {
    clearTimeout(apiKeyTimeout);
    apiKeyTimeout = setTimeout(async () => {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey && apiKey.startsWith('sk-')) {
        await loadModels(apiKey);
      }
    }, 1000);
  });

  // Reset prompt button
  resetPromptBtn.addEventListener('click', () => {
    customPromptInput.value = DEFAULT_PROMPT;
    showToast('Prompt reset to default');
  });

  // Save settings
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;
    const customPrompt = customPromptInput.value.trim();

    if (!apiKey) {
      showToast('Please enter your API key', true);
      return;
    }

    if (!model) {
      showToast('Please select a model', true);
      return;
    }

    if (!customPrompt.includes('{{CONTENT}}')) {
      showToast('Prompt must include {{CONTENT}} placeholder', true);
      return;
    }

    await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: {
        apiKey,
        model,
        customPrompt
      }
    });

    showToast('Settings saved successfully!');
  });

  // Toast notification
  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
});
