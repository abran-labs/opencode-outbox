# Message cards

**Shipped v0.1 scope:** [OpenCode #66032](https://github.com/anomalyco/opencode/issues/66032) tracks checked tool invocation. Until then, Send admits a synthetic message to the originating session with the exact envelope and edited body, and shows **Send requested**. Delivery and reporting belong to that agent. No direct executor, automatic delivery rules, or assertion that a connector has sent the message. The original target design follows.

One agent tool, `create_message_card`, creates a local, persistent, editable draft in an OpenCode Desktop conversation. No connector-side draft at creation. No user mapping screen. The agent supplies the channel label, recipient, optional envelope fields, body and optional declarative delivery mapping for an available messaging MCP. Without a usable mapping the card supports Copy and Discard.

Send freezes the current revision, disables repeat clicks and shows a spinner. Confirmed delivery or discard collapses the card to a short receipt. Known failure preserves edits. Unknown outcome blocks automatic retry. Permission rules may allow explicit send requests by agent or recipient; explicit draft requests always produce drafts and connector approval rules remain authoritative.

## Approaches

Chosen: generic plugin with agent-selected tool mapping. Hardcoded connectors require plugin updates; user-defined adapters require setup. A second model turn to send could change the approved text. Bind the final values directly and support explicit prepare/confirm steps where required.
