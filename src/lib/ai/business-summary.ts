"use server";

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import {
  getMonthlyRevenueTrend,
  getTopCustomersByRevenue,
  getTopProductsByQuantityFulfilled,
  getExpenseBreakdownByCategory,
} from "@/lib/analytics/reports";
import type { ActionResult } from "@/lib/auth/actions";

const GEMINI_MODEL = "gemini-2.5-flash";
const ANTHROPIC_MODEL = "claude-sonnet-5";

function buildPrompt(dataSummary: string): string {
  return `You are a business analyst. Given this data about a small business (monthly revenue trend, top customers by revenue, top products by units sold, and expense breakdown by category over the last 30 days), write a short, plain-language summary (3-5 sentences) highlighting the most useful trend or concern. Don't restate every number — pick what actually matters.\n\nData:\n${dataSummary}`;
}

async function callGemini(apiKey: string, dataSummary: string): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(dataSummary),
  });
  return (response.text ?? "").trim();
}

async function callAnthropic(apiKey: string, dataSummary: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: buildPrompt(dataSummary) }],
  });
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

// Never fabricate an "AI-generated" summary when there's no real model
// behind it (brief §45) — if the org hasn't configured a key, this returns
// a plain, honest "not configured" result rather than a canned paragraph
// dressed up as AI output. Generated on demand (a button click, not page
// load) so a page view never silently spends API budget.
//
// Gemini (GEMINI_API_KEY) is tried first — Google's Gemini API has a
// standing free tier (not a time-boxed trial), so it's the provider an
// org can turn this feature on with at zero cost. ANTHROPIC_API_KEY is
// an optional second option for an org that already pays for Claude and
// wants to use it instead/as well; if both are set, Gemini wins since it's
// the free option this feature was built around.
export async function generateBusinessSummaryAction(organizationId: string): Promise<ActionResult<{ summary: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "reports.financial");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) {
    return {
      ok: false,
      error:
        "AI insights are not configured for this organization. Set GEMINI_API_KEY (free at Google AI Studio) or ANTHROPIC_API_KEY to enable them.",
    };
  }

  const [revenueTrend, topCustomers, topProducts, expenseBreakdown] = await Promise.all([
    getMonthlyRevenueTrend(ctx.organizationId),
    getTopCustomersByRevenue(ctx.organizationId),
    getTopProductsByQuantityFulfilled(ctx.organizationId),
    getExpenseBreakdownByCategory(ctx.organizationId),
  ]);

  const dataSummary = JSON.stringify({ revenueTrend, topCustomers, topProducts, expenseBreakdown }, null, 2);

  try {
    const text = geminiKey ? await callGemini(geminiKey, dataSummary) : await callAnthropic(anthropicKey!, dataSummary);

    if (!text) {
      return { ok: false, error: "The AI service returned an empty response. Try again." };
    }

    return { ok: true, data: { summary: text } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach the AI service";
    return { ok: false, error: message };
  }
}
