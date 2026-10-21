import { createServer } from "node:http";
import {
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const money = (n) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0
}).format(n);

const dateLabel = (date) => {
  if (!date) return "not specified";
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
};

function makeServer() {
  const server = new McpServer({
    name: "quote-rescue",
    version: "0.1.0",
  });

  registerAppTool(server, "draft_quote_followup", {
    title: "Draft quote follow-up",
    description: "Creates a ready-to-review follow-up text or email for a cleaning business quote that has not yet been booked. Use when the user wants to follow up on an estimate, respond to a lead, or recover a quiet quote. Never send the message; return a draft for the user to review.",
    inputSchema: {
      customer_name: z.string().min(1).describe("Customer first name or name"),
      service: z.string().min(1).describe("Cleaning service quoted"),
      quote_amount: z.number().nonnegative().describe("Quoted price in USD"),
      days_since_quote: z.number().int().nonnegative().describe("Number of days since the quote was sent"),
      channel: z.enum(["text", "email"]).default("text").describe("Preferred message channel"),
      context: z.string().optional().describe("Optional customer-specific context, objection, or prior message"),
      tone: z.enum(["friendly", "professional", "warm", "direct"]).default("friendly"),
      call_to_action: z.enum(["ask_if_interested", "offer_times", "answer_questions", "gentle_last_check_in"]).default("ask_if_interested")
    },
  }, async (args) => {
    const firstName = args.customer_name.trim().split(/\s+/)[0];
    const context = args.context?.trim();
    const toneOpeners = {
      friendly: `Hi ${firstName}! Hope you're doing well.`,
      professional: `Hi ${firstName}, I hope you're doing well.`,
      warm: `Hey ${firstName}, hope your week is going well!`,
      direct: `Hi ${firstName}, I'm following up on your cleaning quote.`
    };
    const contextLine = context ? ` I also wanted to follow up on ${context.replace(/[.!?]+$/, "")}.` : "";
    const ctas = {
      ask_if_interested: "Would you still like to move forward, or can I answer any questions?",
      offer_times: "I can share a couple of available times if you'd like to get something on the calendar.",
      answer_questions: "Is there anything about the quote or service I can clarify for you?",
      gentle_last_check_in: "Just let me know if you'd like to move forward; no pressure either way."
    };
    const body = `${toneOpeners[args.tone]} I'm checking in on the ${args.service} estimate for ${money(args.quote_amount)} that I sent ${args.days_since_quote === 0 ? "earlier today" : `${args.days_since_quote} day${args.days_since_quote === 1 ? "" : "s"} ago`}.${contextLine} ${ctas[args.call_to_action]}`;
    const subject = `Checking in on your ${args.service} quote`;
    const message = args.channel === "email"
      ? `Subject: ${subject}\n\n${body}\n\nBest,\n[Your name]`
      : body;
    return {
      content: [{ type: "text", text: `Follow-up draft (${args.channel})\n\n${message}\n\nReview and personalize this draft before sending. Quote Rescue has not contacted the customer.` }],
      structuredContent: {
        customer_name: args.customer_name,
        channel: args.channel,
        subject: args.channel === "email" ? subject : null,
        message,
        quote_amount: args.quote_amount,
        days_since_quote: args.days_since_quote,
        send_status: "draft_only"
      }
    };
  });

  registerAppTool(server, "prioritize_open_quotes", {
    title: "Prioritize open quotes",
    description: "Ranks a cleaning business's open estimates by follow-up urgency and value. Use when a user provides several unsold quotes and asks which ones to follow up with first. Dates should be YYYY-MM-DD; status must be open, booked, or lost.",
    inputSchema: {
      quotes: z.array(z.object({
        customer_name: z.string().min(1),
        service: z.string().min(1),
        amount: z.number().nonnegative(),
        quote_date: z.string().optional().describe("YYYY-MM-DD"),
        follow_up_date: z.string().optional().describe("YYYY-MM-DD"),
        status: z.enum(["open", "booked", "lost"]).default("open"),
        note: z.string().optional()
      })).min(1).max(50)
    },
  }, async ({ quotes }) => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const open = quotes.filter(q => q.status === "open").map(q => {
      const due = q.follow_up_date ? new Date(`${q.follow_up_date}T12:00:00`) : null;
      const daysOverdue = due && !Number.isNaN(due.getTime())
        ? Math.max(0, Math.floor((today - due) / 86400000)) : 0;
      const daysSince = q.quote_date ? Math.max(0, Math.floor((today - new Date(`${q.quote_date}T12:00:00`)) / 86400000)) : null;
      const urgency = daysOverdue > 0 ? "Overdue" : (!due ? "Set a follow-up date" : due <= today ? "Due today" : "Upcoming");
      const score = (daysOverdue * 10) + Math.min(q.amount / 50, 20) + (daysSince && daysSince >= 3 ? 5 : 0);
      return { ...q, daysOverdue, daysSince, urgency, score };
    }).sort((a, b) => b.score - a.score);
    const total = open.reduce((sum, q) => sum + q.amount, 0);
    const summary = open.length
      ? open.map((q, i) => `${i + 1}. ${q.customer_name} — ${q.service}, ${money(q.amount)}. ${q.urgency}${q.daysSince !== null ? `; quote sent ${q.daysSince} day(s) ago` : ""}${q.note ? `; note: ${q.note}` : ""}.`).join("\n")
      : "No open quotes in the supplied list.";
    return {
      content: [{ type: "text", text: `Open quotes: ${open.length}\nPotential open value: ${money(total)}\n\nRecommended follow-up order:\n${summary}\n\nThis is a prioritization aid; check your actual customer history before contacting anyone.` }],
      structuredContent: {
        open_quote_count: open.length,
        potential_open_value: total,
        prioritized_quotes: open.map(({ score, daysOverdue, daysSince, urgency, ...q }) => ({
          ...q, days_overdue: daysOverdue, days_since_quote: daysSince, urgency
        }))
      }
    };
  });

  registerAppTool(server, "quote_followup_plan", {
    title: "Create a follow-up plan",
    description: "Builds a practical, non-automated follow-up cadence for a single unsold cleaning estimate. Use when a cleaning business owner asks what to do next or how many times to follow up.",
    inputSchema: {
      customer_name: z.string().min(1),
      service: z.string().min(1),
      quote_amount: z.number().nonnegative(),
      days_since_quote: z.number().int().nonnegative(),
      customer_replied: z.boolean().default(false),
      known_objection: z.string().optional()
    },
  }, async (args) => {
    let steps;
    if (args.customer_replied) {
      steps = [
        "Reply to the customer's latest message directly; answer their question before asking for a decision.",
        "If they need time, ask when it would be helpful to check back and record that date.",
        "Avoid sending a generic nudge while they are actively responding."
      ];
    } else if (args.days_since_quote <= 1) {
      steps = [
        "If the quote was just sent, give the customer time to review it.",
        "Set a friendly follow-up for about 2 days after the quote if they have not replied.",
        "Prepare a short message that offers to answer questions rather than immediately discounting."
      ];
    } else if (args.days_since_quote <= 5) {
      steps = [
        "Send one friendly check-in today and offer to clarify the scope or pricing.",
        "If there is no reply, set one more follow-up in 3–4 days.",
        "If they decline or ask you to stop, update the status and do not continue nudging."
      ];
    } else {
      steps = [
        "Send a brief, low-pressure last check-in today; acknowledge they may have made other plans.",
        "If they do not reply, close the loop rather than continuing repeated messages.",
        "Record the outcome so future quotes can be followed up more consistently."
      ];
    }
    if (args.known_objection?.trim()) {
      steps.unshift(`Address the known concern first: "${args.known_objection.trim()}". Be factual; do not promise a discount or availability you cannot honor.`);
    }
    const text = `Follow-up plan for ${args.customer_name}\nQuote: ${args.service} — ${money(args.quote_amount)}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nNo message has been sent and no reminder has been scheduled.`;
    return { content: [{ type: "text", text }], structuredContent: { customer_name: args.customer_name, quote_amount: args.quote_amount, steps, automated_actions: false } };
  });

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";
const httpServer = createServer(async (req, res) => {
  if (!req.url) { res.writeHead(400).end("Missing URL"); return; }
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization",
      "Access-Control-Expose-Headers": "Mcp-Session-Id"
    }).end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end("Quote Rescue MCP server is running.");
    return;
  }
  if (url.pathname === MCP_PATH && ["POST", "GET", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP request failed:", err);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }
  res.writeHead(404).end("Not Found");
});
httpServer.listen(port, () => console.log(`Quote Rescue MCP server listening on port ${port} at ${MCP_PATH}`));
