# media-mcp

**An MCP server that lets an AI agent generate images and video through a swappable generative backend — the visual hands behind an autonomous social-posting agent.**

A pure, stateless MCP wrapper: raw pass-through with a self-teaching catalog, a multi-provider multiplexer, and per-key rate-limit discipline. Default backend is the **xAI / Grok** API (OpenAI-compatible); anti-lock-in by design — the agent talks only to the MCP, so switching providers is a one-line config change.

## Why a wrapper, not an engine

The paradigm is: the LLM *calls* generative models — it no longer bundles local inference. Grok is pay-as-you-go and cheap, its output is open-weight and metadata-cleanable, and swapping it out costs nothing because every provider lives behind the same `provider` seam.

## Design

- **Raw pass-through, nothing capped.** `media_call` forwards `method / endpoint / payload / provider` straight to the API. The catalog documents; it never gates.
- **Multi-provider multiplexer.** `Authorization: Bearer <key>`, base URL per provider, hot-reloaded from disk. A switch commits only after proof via `GET /models`.
- **Per-key throttle.** One [`p-throttle`](https://github.com/sindresorhus/p-throttle) per API key, never shared, never hand-rolled.
- **Session-scoped state.** The active provider lives per MCP session, never a process-global — no leakage between concurrent HTTP agents.
- **Async video, sync images.** Video: `POST /videos/generations` → poll `GET /videos/{id}`. Images: synchronous generation + edits (reference images as base64 data-URIs). Self-teaching catalog: every write endpoint carries `params` or an `example`, sourced from live calls — zero invented endpoints.

## Tools

| Tool | Purpose |
|------|---------|
| `media_call` | Raw API pass-through (image / video) |
| `media_discover` | Self-documenting endpoint catalog |
| `media_switch_provider` | Switch active provider (identity-proven) |
| `media_health` | Providers + invalid-request window |

## Transports

- **stdio** — local use (`npm start`)
- **HTTP** — StreamableHTTP for a remote service (`npm run start:http`): binds a Tailscale IP or `127.0.0.1` (never `0.0.0.0` outside a container), constant-time Bearer auth (refuses to boot without it), active DNS-rebind protection, one transport per session.

## Stack

Node ≥22, ESM. `@modelcontextprotocol/sdk` · Express 5 · `p-throttle`.
**Testing:** Vitest (unit) + Stryker (mutation, ratcheted gate at 80%), wired into Husky pre-commit/pre-push. Network I/O is excluded from mutation; pure logic is fully mutated.

## Quick start

```bash
npm install
cp .secrets.example.json .secrets.json   # add your provider key(s)
npm start            # stdio
npm run start:http   # HTTP service
```

Secrets shape: `{ default, providers: { <id>: { api_key, base_url } } }` — never committed (`.gitignore`).

---
<sub>Part of a set of home-built MCP servers. Built to be driven by an agent, hardened for concurrency.</sub>
