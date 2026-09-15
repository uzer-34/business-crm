"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderTree, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCategoryAction, addRecommendationAction, removeRecommendationAction, updateRecommendationAction } from "@/lib/metadata/category-actions";
import { applyRecommendationsAction } from "@/lib/metadata/field-actions";
import { cn } from "@/lib/utils";

interface CategoryNodeView {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  childCount: number;
  productCount: number;
  recommendationCount: number;
  path: string;
}

interface RecommendationView {
  id: string;
  templateKey: string;
  label: string;
  reason: string | null;
  recommendRequired: boolean;
  defaultSelected: boolean;
  isActive: boolean;
  alreadyApplied: boolean;
}

export function CategoryManager({
  organizationId,
  kind,
  kinds,
  nodes,
  selected,
  entityKey,
  recommendations,
  availableTemplates,
}: {
  organizationId: string;
  kind: string;
  kinds: { value: string; label: string }[];
  nodes: CategoryNodeView[];
  selected: CategoryNodeView | null;
  entityKey: string;
  recommendations: RecommendationView[];
  availableTemplates: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const unusedTemplates = availableTemplates.filter(
    (template) => !recommendations.some((recommendation) => recommendation.templateKey === template.key),
  );

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, successMessage?: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (successMessage) setNotice(successMessage);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {kinds.map((option) => (
            <Link
              key={option.value}
              href={`/settings/categories?kind=${option.value.toLowerCase()}`}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors",
                option.value === kind
                  ? "border-transparent bg-selected text-foreground"
                  : "border-border text-foreground-muted hover:bg-hover",
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add category
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Pick one to manage its suggested attributes.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {nodes.length === 0 ? (
              <EmptyState
                icon={FolderTree}
                title="No categories yet"
                description="Categories group your catalog and drive which attributes get suggested."
                action={
                  <Button size="sm" onClick={() => setCreating(true)}>
                    Add category
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col">
                {nodes.map((node) => (
                  <li key={node.id}>
                    <Link
                      href={`/settings/categories?kind=${kind.toLowerCase()}&category=${node.id}`}
                      className={cn(
                        "flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[13px] last:border-0 hover:bg-hover",
                        selected?.id === node.id && "bg-selected",
                      )}
                      // Indentation communicates depth without a nested list.
                      style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                    >
                      <span className="min-w-0 truncate">{node.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {node.recommendationCount > 0 && (
                          <Badge tone="accent">{node.recommendationCount} suggested</Badge>
                        )}
                        {node.productCount > 0 && <Badge>{node.productCount} in use</Badge>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selected ? `Suggested attributes for ${selected.name}` : "Suggested attributes"}</CardTitle>
            <CardDescription>
              {selected
                ? `Offered whenever someone works on a ${entityKey} in ${selected.path}.`
                : "Choose a category on the left."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!selected ? (
              <EmptyState icon={Sparkles} title="Nothing selected" description="Pick a category to see what it suggests." />
            ) : (
              <>
                {recommendations.length === 0 ? (
                  <p className="text-[13px] text-foreground-muted">
                    Nothing suggested yet. Add an attribute below and it will be offered the next time someone works in
                    this category.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {recommendations.map((recommendation) => (
                      <li
                        key={recommendation.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-medium">{recommendation.label}</span>
                            {recommendation.alreadyApplied && <Badge tone="success">In use</Badge>}
                            {!recommendation.isActive && <Badge tone="warning">Turned off</Badge>}
                          </div>
                          {recommendation.reason && (
                            <p className="text-[12px] text-foreground-muted">{recommendation.reason}</p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <Checkbox
                              id={`req-${recommendation.id}`}
                              checked={recommendation.recommendRequired}
                              disabled={isPending}
                              onCheckedChange={(checked) =>
                                run(() =>
                                  updateRecommendationAction(recommendation.id, {
                                    recommendRequired: checked === true,
                                  }),
                                )
                              }
                            />
                            <Label htmlFor={`req-${recommendation.id}`}>Suggest as required</Label>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() =>
                              run(() =>
                                updateRecommendationAction(recommendation.id, { isActive: !recommendation.isActive }),
                              )
                            }
                          >
                            {recommendation.isActive ? "Turn off" : "Turn on"}
                          </Button>
                          <IconButton
                            label={`Remove ${recommendation.label}`}
                            size="icon-sm"
                            disabled={isPending}
                            onClick={() => run(() => removeRecommendationAction(recommendation.id))}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {unusedTemplates.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="add-recommendation">Suggest another attribute</Label>
                    <div className="flex gap-2">
                      <NativeSelect id="add-recommendation" defaultValue="" disabled={isPending}
                        onChange={(event) => {
                          const templateKey = event.target.value;
                          if (!templateKey) return;
                          event.currentTarget.value = "";
                          run(
                            () => addRecommendationAction(organizationId, { categoryId: selected.id, templateKey }),
                            "Added to the suggestions.",
                          );
                        }}
                      >
                        <option value="">Choose an attribute…</option>
                        {unusedTemplates.map((template) => (
                          <option key={template.key} value={template.key}>
                            {template.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                )}

                {recommendations.some((recommendation) => recommendation.isActive && !recommendation.alreadyApplied) && (
                  <div>
                    <Button
                      size="sm"
                      loading={isPending}
                      onClick={() =>
                        run(
                          () =>
                            applyRecommendationsAction(organizationId, {
                              categoryId: selected.id,
                              entityKey,
                              templateKeys: recommendations
                                .filter((r) => r.isActive && !r.alreadyApplied)
                                .map((r) => r.templateKey),
                              scopeToCategory: true,
                            }),
                          "Attributes created.",
                        )
                      }
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      Create these attributes now
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {creating && (
        <NewCategoryDialog
          organizationId={organizationId}
          kind={kind}
          parents={nodes}
          onClose={() => setCreating(false)}
          onCreated={(seeded) => {
            setCreating(false);
            setNotice(
              seeded > 0
                ? `Category added, with ${seeded} suggested ${seeded === 1 ? "attribute" : "attributes"}.`
                : "Category added.",
            );
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NewCategoryDialog({
  organizationId,
  kind,
  parents,
  onClose,
  onCreated,
}: {
  organizationId: string;
  kind: string;
  parents: CategoryNodeView[];
  onClose: () => void;
  onCreated: (seededRecommendations: number) => void;
}) {
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createCategoryAction(organizationId, { kind, name, parentId: parentId || undefined });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onCreated(result.data.seededRecommendations);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
            <DialogDescription>
              Well-known names such as Shirts, Jeans or Rings arrive with their usual attributes already suggested.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <FormField label="Name" required>
              {(props) => <Input {...props} value={name} onChange={(event) => setName(event.target.value)} autoFocus />}
            </FormField>

            {parents.length > 0 && (
              <FormField label="Inside" description="Leave blank to create a top-level category.">
                {(props) => (
                  <NativeSelect {...props} value={parentId} onChange={(event) => setParentId(event.target.value)}>
                    <option value="">Top level</option>
                    {parents.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.path}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            )}

            {error && <Alert tone="danger">{error}</Alert>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending} disabled={!name.trim()}>
              Add category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
