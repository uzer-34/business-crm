"use server";

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

const MODEL = "claude-sonnet-5";

// Never fabricate an "AI-generated" summary when there's no real model
// behind it (brief §45) — if the org hasn't configured a key, this returns
// a plain, honest "not configured" result rather than a canned paragraph
// dressed up as AI output. Generated on demand (a button click, not page
// load) so a page view never silently spends API budget.
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "AI insights are not configured for this organization. Set ANTHROPIC_API_KEY to enable them.",
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
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are a business analyst. Given this data about a small business (monthly revenue trend, top customers by revenue, top products by units sold, and expense breakdown by category over the last 30 days), write a short, plain-language summary (3-5 sentences) highlighting the most useful trend or concern. Don't restate every number — pick what actually matters.\n\nData:\n${dataSummary}`,
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      return { ok: false, error: "The AI service returned an empty response. Try again." };
    }

    return { ok: true, data: { summary: text } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach the AI service";
    return { ok: false, error: message };
  }
}
