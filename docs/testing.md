# Test Outbox

1. In OpenCode Desktop, ask: “Make a copy-only Outbox card with the body ‘first draft’.” Edit the body, click **Copy**, and paste it somewhere to verify the clipboard. Click **Discard** and reopen the conversation; the receipt should still say **Discarded**.
2. For delivery, use a test recipient or recording MCP. Ask for a draft addressed to that destination. Change the body and click **Send**. The card should switch to **Send requested** and the agent should use the existing messaging connector. Check the connector’s recorded body against the edit.

For contributors:

```sh
bun install --frozen-lockfile
npm test
CHROMIUM_PATH=/usr/bin/chromium node tests/desktop.smoke.js
```

The Chromium test mounts the actual GUI entry with a small Desktop host fixture. It exercises editing, copying, discarding and requesting a send without a real recipient.
