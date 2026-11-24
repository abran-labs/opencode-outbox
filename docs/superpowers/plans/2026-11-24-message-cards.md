# Message Cards Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans. Steps use checkbox syntax.

**Goal:** Editable messaging cards with optional real delivery in OpenCode Desktop.

**Architecture:** One server tool stores session-owned cards; a GUI code-block renderer resolves card IDs and edits them via plugin RPC. A declarative mapping binds the frozen card to existing connector tools.

**Tech stack:** OpenCode V2 plugin SDK, TypeScript, Solid, Vite GUI preset.

**Spec:** `../specs/2026-11-24-message-cards-design.md`

## Global constraints
No changes to connected MCPs. No external message sent by tests. Preserve connector permissions, final text and destination. No model-authored executable code in delivery mappings.

## Review focus
Edited text, forged or cross-session IDs, double clicks, ambiguous delivery, and stale tool mappings.

### 1. Prove delivery dispatch first
- [ ] In `src/delivery.ts`, establish that an existing MCP tool can be called under its original execution and permission context. The installed server exposes no public HTTP tool-call route. Try wrapping a registered tool executor in a live tool context rather than inventing an endpoint.
- [ ] Use a disposable recording MCP to verify direct and prepare/confirm calls with edited inputs. Verify denied or absent tool never executes. If the SDK cannot preserve this boundary, stop and report the precise constraint before building around it.

### 2. Implement the card lifecycle
- [ ] In `src/server.ts` register `create_message_card`; in `src/cards.ts` implement persisted session-scoped create/edit/send/discard; expose UI actions through `src/rpc.ts`. Store no executable plan in rendered Markdown, only a card ID.
- [ ] Test exact final values, foreign session rejection, concurrent sends, terminal states after reload, ambiguous results and unavailable connectors. Permit direct delivery only for send intent under applicable user and connector rules.

### 3. Render and verify in Desktop
- [ ] In `src/gui.tsx` render editable body, channel-specific envelope, Send or Copy, Discard, send-rule menu, spinner and collapsed receipts. Persist pending edits before actions.
- [ ] Build the plugin, load locally, and exercise copy-only, edited send, failed send and discard in Desktop with a recording connector. Verify recorded recipient/body, not just the appearance of the receipt.
