"use strict";
(() => {
  // src/lib/default-config.ts
  var DEFAULT_CONFIG = {
    apiBaseUrl: "",
    extensionToken: ""
  };

  // src/lib/storage.ts
  var STORAGE_KEY = "webMonitorConfig";
  async function getConfig() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY];
    if (value?.apiBaseUrl && value.extensionToken) return value;
    return DEFAULT_CONFIG;
  }
  async function setConfig(config) {
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  }

  // src/lib/messages.ts
  async function sendExtensionMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // src/options/options.ts
  var form = document.getElementById("config-form");
  var apiBaseUrlInput = document.getElementById("apiBaseUrl");
  var extensionTokenInput = document.getElementById("extensionToken");
  var statusEl = document.getElementById("status");
  async function loadExisting() {
    const config = await getConfig();
    apiBaseUrlInput.value = config.apiBaseUrl;
    extensionTokenInput.value = config.extensionToken;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await setConfig({
      apiBaseUrl: apiBaseUrlInput.value.trim(),
      extensionToken: extensionTokenInput.value.trim()
    });
    statusEl.textContent = "Saved.";
  });
  document.getElementById("test-connection")?.addEventListener("click", async () => {
    await setConfig({
      apiBaseUrl: apiBaseUrlInput.value.trim(),
      extensionToken: extensionTokenInput.value.trim()
    });
    statusEl.textContent = "Checking...";
    const result = await sendExtensionMessage({ type: "PING_API" });
    statusEl.textContent = result.ok ? "Connected successfully." : `Connection failed: ${result.error}`;
  });
  void loadExisting();
})();
