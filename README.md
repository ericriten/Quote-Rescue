# Quote Rescue — ChatGPT App starter

This is the first actual app/server implementation for Quote Rescue. It follows the current OpenAI Apps SDK / MCP server quickstart structure.

## Tools included
- `draft_quote_followup`: draft a text or email for a cleaning quote. Draft only; never sends messages.
- `prioritize_open_quotes`: rank a list of open quotes by urgency and potential value.
- `quote_followup_plan`: suggest a practical next-step cadence for one quote.

## Important MVP boundaries
- This version has no database, user accounts, billing, SMS/email delivery, or scheduled reminders.
- It does not persist quote data; each tool works from information supplied in the conversation.
- Do not submit real customer personal information during early testing.
- This is an implementation starter; test it before relying on it or submitting it publicly.

## Run locally
Requires Node.js 18+.

```bash
npm install
npm start
```

The server should report that it is listening on port 8787. Visit `http://localhost:8787/` for the health check. The MCP endpoint is `http://localhost:8787/mcp`.

## Connect to ChatGPT for private testing
ChatGPT needs an HTTPS-reachable MCP endpoint. For local testing, expose port 8787 using a tunnel such as ngrok, then use the tunnel's HTTPS URL ending in `/mcp` in ChatGPT's custom app / MCP setup. The exact menu and access to developer mode can depend on your account and workspace. Do not publish this unauthenticated prototype publicly.

## Deploying
Deploy the Node server to a host that supports a long-running Node process and HTTPS. Set the start command to `npm start` and use the host-provided port. Keep the `/mcp` path. Start with the host's free tier, and verify current limits before choosing a provider.

## Next steps
1. Run and test all three tools.
2. Connect privately in ChatGPT and test representative quote scenarios.
3. Add privacy policy, authentication, persistent storage, rate limits, and monitoring before any public launch.
4. Build the website and subscription flow separately. OpenAI's current app monetization guidance allows linking out to a developer-owned site subject to its terms and policies; don't assume digital subscriptions are automatically eligible for in-ChatGPT checkout.
