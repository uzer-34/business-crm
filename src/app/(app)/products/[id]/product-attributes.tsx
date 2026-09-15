"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DynamicForm, type DynamicSection, type DynamicValues } from "@/components/metadata/dynamic-form";
import { applyRecommendationsAction } from "@/lib/metadata/field-actions";
import { saveProductAttributesAction } from "@/lib/catalog/product-actions";

export interface RecommendationView {
  id: string;
  templateKey: string;
  label: string;
  reason: string | null;
  recommendRequired: boolean;
  defaultSelected: boolean;
  alreadyApplied: boolean;
}

/**
 * The Product proof for the attribute engine.
 *
 * Nothing about Size, Colour, Fabric, Sleeve or Collar is written here. The
 * category's recommendations arrive as data, applying them creates real field
 * definitions, and DynamicForm renders whatever came back.
 */
export function ProductAttributes({
  organizationId,
  productId,
  categoryName,
  categoryId,
  sections,
  initialValues,
  recommendations,
  canConfigure,
  canEdit,
}: {
  organizationId: string;
  productId: string;
  categoryName: string | null;
  categoryId: string | null;
  sections: DynamicSection[];
  initialValues: DynamicValues;
  recommendations: RecommendationView[];
  canConfigure: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<DynamicValues>(initialValues);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const pending = recommendations.filter((recommendation) => !recommendation.alreadyApplied);
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(pending.filter((r) => r.defaultSelected).map((r) => r.templateKey)),
  );
  const [customizing, setCustomizing] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  const apply = (templateKeys: string[]) => {
    if (!categoryId || templateKeys.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await applyRecommendationsAction(organizationId, {
        categoryId,
        entityKey: "product",
        templateKeys,
        scopeToCategory: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        `Added ${result.data.createdCount} ${result.data.createdCount === 1 ? "attribute" : "attributes"}` +
          (result.data.skippedCount > 0 ? ` · ${result.data.skippedCount} already existed` : ""),
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && !dismissed && categoryId && canConfigure && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              Recommended attributes for {categoryName}
            </CardTitle>
            <CardDescription>
              Businesses selling {categoryName?.toLowerCase()} usually track these. Adding them here makes them
              available on every product in this category.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {customizing ? (
              <div className="flex flex-col gap-1.5">
                {pending.map((recommendation) => {
                  const id = `rec-${recommendation.templateKey}`;
                  return (
                    <div key={recommendation.templateKey} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked={selected.has(recommendation.templateKey)}
                        onCheckedChange={(checked) =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (checked === true) next.add(recommendation.templateKey);
                            else next.delete(recommendation.templateKey);
                            return next;
                          })
                        }
                      />
                      <label htmlFor={id} className="cursor-pointer text-[13px]">
                        {recommendation.label}
                        {recommendation.recommendRequired && (
                          <Badge tone="accent" className="ml-1.5">
                            Suggested as required
                          </Badge>
                        )}
                        {recommendation.reason && (
                          <span className="block text-[12px] text-foreground-subtle">{recommendation.reason}</span>
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pending.map((recommendation) => (
                  <Badge key={recommendation.templateKey} tone="accent">
                    {recommendation.label}
                  </Badge>
                ))}
              </div>
            )}

            {error && <Alert tone="danger">{error}</Alert>}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={isPending}
                onClick={() => apply(customizing ? Array.from(selected) : pending.map((r) => r.templateKey))}
                disabled={customizing && selected.size === 0}
              >
                {customizing ? `Add ${selected.size} selected` : "Apply recommendations"}
              </Button>
              {!customizing && (
                <Button size="sm" variant="outline" onClick={() => setCustomizing(true)}>
                  Customize
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {notice && <Alert tone="success">{notice}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
          <CardDescription>
            {categoryName
              ? `Configured for ${categoryName} and for all products.`
              : "Configured for all products."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sections.length === 0 ? (
            <EmptyState
              title="No attributes configured yet"
              description={
                categoryId && canConfigure
                  ? "Apply the recommendations above, or add your own in Settings → Attributes."
                  : "An owner can add attributes in Settings → Attributes."
              }
            />
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                setNotice(null);
                startTransition(async () => {
                  const result = await saveProductAttributesAction(productId, values);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setNotice("Attributes saved.");
                  router.refresh();
                });
              }}
            >
              <DynamicForm
                sections={sections}
                values={values}
                onChange={(fieldId, value) => {
                  setNotice(null);
                  setValues((previous) => ({ ...previous, [fieldId]: value }));
                }}
              />
              {error && <Alert tone="danger">{error}</Alert>}
              {canEdit && (
                <div>
                  <Button type="submit" size="sm" loading={isPending}>
                    {isPending ? "Saving…" : "Save attributes"}
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
