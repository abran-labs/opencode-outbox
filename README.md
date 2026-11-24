![OpenCode Outbox banner showing an upward arrow over a tray beside the product name](.github/assets/opencode-outbox-banner.svg)

# OpenCode Outbox

**Edit messages before they go out.**

## Install

```sh
opencode plugin add github:abran-labs/opencode-outbox
```

## Message cards

Ask your agent in OpenCode Desktop V2 to draft a message. Edit the draft directly on its local card; creating a card doesn't send anything.

| Action | What it does |
| --- | --- |
| Send | Asks the current session's agent to deliver your exact edited message through its usual messaging MCP. Connector permissions and approvals still apply. |
| Copy | Copies your edited message for manual sending. |
| Discard | Closes the draft without sending it. |

A **Send requested** receipt means the agent was asked to send, not that delivery was confirmed.

## Uninstall

```sh
opencode plugin remove github:abran-labs/opencode-outbox
```
