import { getConfig, setConfig } from '../lib/storage.js';
import { sendExtensionMessage } from '../lib/messages.js';

const form = document.getElementById('config-form') as HTMLFormElement;
const apiBaseUrlInput = document.getElementById('apiBaseUrl') as HTMLInputElement;
const extensionTokenInput = document.getElementById('extensionToken') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

async function loadExisting(): Promise<void> {
  const config = await getConfig();
  apiBaseUrlInput.value = config.apiBaseUrl;
  extensionTokenInput.value = config.extensionToken;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await setConfig({
    apiBaseUrl: apiBaseUrlInput.value.trim(),
    extensionToken: extensionTokenInput.value.trim(),
  });
  statusEl.textContent = 'Saved.';
});

document.getElementById('test-connection')?.addEventListener('click', async () => {
  await setConfig({
    apiBaseUrl: apiBaseUrlInput.value.trim(),
    extensionToken: extensionTokenInput.value.trim(),
  });
  statusEl.textContent = 'Checking...';
  const result = await sendExtensionMessage({ type: 'PING_API' });
  statusEl.textContent = result.ok
    ? 'Connected successfully.'
    : `Connection failed: ${result.error}`;
});

void loadExisting();
