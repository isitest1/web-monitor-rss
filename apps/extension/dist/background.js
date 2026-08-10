"use strict";
(() => {
  // src/lib/default-config.ts
  var DEFAULT_CONFIG = {
    apiBaseUrl: "https://web-monitor-rss-worker.kouhei1.workers.dev",
    extensionToken: "001b62fe084115ab799dbe28de83e05629dcb8f2da3279555c7a0d51b6b5b6f5"
  };

  // src/lib/storage.ts
  var STORAGE_KEY = "webMonitorConfig";
  async function getConfig() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY];
    if (value?.apiBaseUrl && value.extensionToken) return value;
    return DEFAULT_CONFIG;
  }

  // src/lib/api-client.ts
  async function apiFetch(config, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${config.extensionToken}`);
    if (init.body) headers.set("content-type", "application/json");
    const res = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API request failed: ${init.method ?? "GET"} ${path} -> ${res.status} ${body}`);
    }
    return res;
  }
  async function listMonitors(config) {
    const res = await apiFetch(config, "/api/monitors");
    const body = await res.json();
    return body.monitors;
  }
  async function getMonitor(config, monitorId) {
    const res = await apiFetch(config, `/api/monitors/${monitorId}`);
    return await res.json();
  }
  async function createMonitor(config, payload) {
    const res = await apiFetch(config, "/api/monitors", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return await res.json();
  }
  async function updateMonitor(config, monitorId, payload) {
    const res = await apiFetch(config, `/api/monitors/${monitorId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return await res.json();
  }
  async function setMonitorEnabled(config, monitorId, enabled) {
    const res = await apiFetch(
      config,
      `/api/monitors/${monitorId}/${enabled ? "enable" : "disable"}`,
      {
        method: "POST"
      }
    );
    return await res.json();
  }
  async function pingApi(config) {
    await apiFetch(config, "/api/feeds");
  }

  // src/background/service-worker.ts
  async function handleMessage(message) {
    const config = await getConfig();
    try {
      switch (message.type) {
        case "LIST_MONITORS":
          return { ok: true, data: { monitors: await listMonitors(config) } };
        case "GET_MONITOR":
          return { ok: true, data: await getMonitor(config, message.monitorId) };
        case "CREATE_MONITOR":
          return { ok: true, data: await createMonitor(config, message.payload) };
        case "UPDATE_MONITOR":
          return { ok: true, data: await updateMonitor(config, message.monitorId, message.payload) };
        case "SET_MONITOR_ENABLED":
          return {
            ok: true,
            data: await setMonitorEnabled(config, message.monitorId, message.enabled)
          };
        case "PING_API":
          await pingApi(config);
          return { ok: true, data: null };
        case "START_SELECTION_MODE":
          return { ok: false, error: "unsupported from background" };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true;
  });
})();
