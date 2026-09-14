"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { generateBusinessSummaryAction } from "@/lib/ai/business-summary";

export function AiSummaryCard({ organizationId }: { organizationId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Summary</CardTitle>
        <CardDescription>A plain-language read of the trends below, generated on demand.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {summary && <p className="text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          size="sm"
          className="self-start"
          disabled={isPending}
          onClick={() => {
            setError(null);
            setSummary(null);
            startTransition(async () => {
              const result = await generateBusinessSummaryAction(organizationId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSummary(result.data.summary);
            });
          }}
        >
          {isPending ? "Generating…" : "Generate insights"}
        </Button>
      </CardContent>
    </Card>
  );
}
