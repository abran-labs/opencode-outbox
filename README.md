![OpenCode Outbox banner showing an upward arrow over a tray beside the product name](.github/assets/opencode-outbox-banner.svg)

# OpenCode Outbox

## Install

```sh
opencode plugin add github:abran-labs/opencode-outbox
```

## Message cards

Ask your agent to draft a message. Edit the draft directly on its local card. Send it.

| Action | What it does |
| --- | --- |
| Send | Asks the agent to deliver your exact draft through its usual messaging MCP. (e.g. https://github.com/taylorwilsdon/google_workspace_mcp) |
| Send ▾ | **Disable drafts** skips Outbox review for explicit send requests across sessions and agents. **Allow recipient** limits that shortcut to a recipient. Asking for a draft always creates one. |
| Copy | Copies your exact draft to your clipboard. |
| Discard | Closes the draft without sending it. |

## Uninstall

```sh
opencode plugin remove github:abran-labs/opencode-outbox
```
