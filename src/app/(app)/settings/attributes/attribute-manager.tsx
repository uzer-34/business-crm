"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, EyeOff, Plus, Settings2, Trash2, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DATA_TYPE_SPECS, supportedDataTypes } from "@/lib/metadata/entities";
import {
  archiveFieldAction,
  createFieldAction,
  reorderFieldsAction,
  updateFieldAction,
} from "@/lib/metadata/field-actions";
import { cn } from "@/lib/utils";

/*
 * Attribute administration.
 *
 * Speaks human: "Field type", "Required field", "Only these roles can see it".
 * Machine keys and organization ids never appear — the key is derived from the
 * label when creating, and shown only as small print afterwards because it is
 * what imports and integrations refer to.
 */

interface FieldView {
  id: string;
  key: string;
  label: string;
  description: string | null;
  dataType: string;
  source: string;
  isRequired: boolean;
  hidden: boolean;
  sectionId: string | null;
  options: { value: string; label: string }[];
  categoryIds: string[];
  roleKeys: string[];
}

interface EntityView {
  key: string;
  label: string;
  pluralLabel: string;
  description: string;
  supportsCategories: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  SYSTEM: "Built in",
  CUSTOM: "Added by you",
  INDUSTRY: "From your industry",
  CATEGORY: "From a category",
};

/** "Sleeve length" -> "sleeve_length", so the user never types a machine key. */
function deriveKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function AttributeManager({
  organizationId,
  entities,
  activeEntityKey,
  fields,
  sections,
  categories,
  roles,
}: {
  organizationId: string;
  entities: EntityView[];
  activeEntityKey: string;
  fields: FieldView[];
  sections: { id: string; label: string }[];
  categories: { id: string; name: string }[];
  roles: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<FieldView | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const entity = entities.find((candidate) => candidate.key === activeEntityKey) ?? entities[0];

  const move = (index: number, direction: -1 | 1) => {
    const next = [...fields];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    startTransition(async () => {
      const result = await reorderFieldsAction(organizationId, {
        entityKey: entity.key,
        orderedFieldIds: next.map((field) => field.id),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const archive = (field: FieldView) => {
    startTransition(async () => {
      const result = await archiveFieldAction(field.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Entity picker. Scrolls horizontally on narrow screens. */}
      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1.5">
          {entities.map((candidate) => (
            <Link
              key={candidate.key}
              href={`/settings/attributes?entity=${candidate.key}`}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                candidate.key === entity.key
                  ? "border-transparent bg-selected text-foreground"
                  : "border-border text-foreground-muted hover:bg-hover",
              )}
            >
              {candidate.pluralLabel}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-foreground-muted">{entity.description}</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add attribute
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {fields.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Settings2}
              title={`No attributes on ${entity.pluralLabel.toLowerCase()} yet`}
              description={`Add one here, or let a category suggest them when you create a ${entity.label.toLowerCase()}.`}
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  Add attribute
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li key={field.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 flex-col">
                  <IconButton
                    label="Move up"
                    size="icon-sm"
                    disabled={index === 0 || isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    size="icon-sm"
                    disabled={index === fields.length - 1 || isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  </IconButton>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium">{field.label}</span>
                    <Badge>{DATA_TYPE_SPECS[field.dataType as keyof typeof DATA_TYPE_SPECS]?.label ?? field.dataType}</Badge>
                    {field.isRequired && <Badge tone="accent">Required</Badge>}
                    {field.hidden && (
                      <Badge tone="warning">
                        <EyeOff className="size-3" aria-hidden="true" />
                        Hidden
                      </Badge>
                    )}
                    {field.source !== "CUSTOM" && <Badge tone="neutral">{SOURCE_LABEL[field.source]}</Badge>}
                  </div>
                  {field.description && (
                    <p className="mt-0.5 text-[12px] text-foreground-muted">{field.description}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-foreground-subtle">
                    Reference name: {field.key}
                    {field.options.length > 0 && ` · ${field.options.length} choices`}
                    {field.categoryIds.length > 0 && ` · limited to ${field.categoryIds.length} categories`}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(field)}>
                    Edit
                  </Button>
                  <IconButton label="Archive attribute" size="icon-sm" disabled={isPending} onClick={() => archive(field)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <FieldDialog
          organizationId={organizationId}
          entity={entity}
          field={editing}
          sections={sections}
          categories={categories}
          roles={roles}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FieldDialog({
  organizationId,
  entity,
  field,
  sections,
  categories,
  roles,
  onClose,
  onSaved,
}: {
  organizationId: string;
  entity: EntityView;
  field: FieldView | null;
  sections: { id: string; label: string }[];
  categories: { id: string; name: string }[];
  roles: { key: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = field !== null;
  const [label, setLabel] = React.useState(field?.label ?? "");
  const [description, setDescription] = React.useState(field?.description ?? "");
  const [dataType, setDataType] = React.useState(field?.dataType ?? "TEXT");
  const [isRequired, setIsRequired] = React.useState(field?.isRequired ?? false);
  const [hidden, setHidden] = React.useState(field?.hidden ?? false);
  const [sectionId, setSectionId] = React.useState(field?.sectionId ?? "");
  const [options, setOptions] = React.useState<{ value: string; label: string }[]>(field?.options ?? []);
  const [categoryIds, setCategoryIds] = React.useState<string[]>(field?.categoryIds ?? []);
  const [roleKeys, setRoleKeys] = React.useState<string[]>(field?.roleKeys ?? []);
  const [newOption, setNewOption] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const spec = DATA_TYPE_SPECS[dataType as keyof typeof DATA_TYPE_SPECS];
  const needsOptions = spec?.usesOptions ?? false;

  const addOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    const value = deriveKey(trimmed) || trimmed.toLowerCase();
    if (options.some((option) => option.value === value)) return;
    setOptions((previous) => [...previous, { value, label: trimmed }]);
    setNewOption("");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload = {
      label,
      description: description || undefined,
      isRequired,
      hidden,
      sectionId: sectionId || undefined,
      searchable: false,
      filterable: false,
      sortable: false,
      roleKeys,
      categoryIds,
      options,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateFieldAction(field.id, payload)
        : await createFieldAction(organizationId, {
            ...payload,
            entityKey: entity.key,
            key: deriveKey(label),
            dataType,
          });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <form className="flex min-h-0 flex-col" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${field.label}` : `New attribute on ${entity.pluralLabel}`}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "The field type and reference name can't change — existing records already use them."
                : `Everything you capture on a ${entity.label.toLowerCase()}, beyond the built-in details.`}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <FormField label="Name" description="What your team sees on the form." required>
              {(props) => (
                <Input {...props} value={label} onChange={(event) => setLabel(event.target.value)} autoFocus />
              )}
            </FormField>

            <FormField label="Help text" description="Optional hint shown under the field.">
              {(props) => (
                <Textarea {...props} value={description} onChange={(event) => setDescription(event.target.value)} />
              )}
            </FormField>

            {!isEdit && (
              <FormField label="Field type" required>
                {(props) => (
                  <NativeSelect {...props} value={dataType} onChange={(event) => setDataType(event.target.value)}>
                    {supportedDataTypes().map((type) => (
                      <option key={type} value={type}>
                        {DATA_TYPE_SPECS[type].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            )}

            {needsOptions && (
              <div className="flex flex-col gap-2">
                <Label>Choices</Label>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((option) => (
                    <span
                      key={option.value}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[12px]"
                    >
                      {option.label}
                      <button
                        type="button"
                        aria-label={`Remove ${option.label}`}
                        onClick={() => setOptions((previous) => previous.filter((o) => o.value !== option.value))}
                        className="cursor-pointer text-foreground-subtle hover:text-danger"
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {options.length === 0 && (
                    <span className="text-[12px] text-foreground-subtle">No choices yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={(event) => setNewOption(event.target.value)}
                    placeholder="Add a choice, e.g. Medium"
                    aria-label="New choice"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addOption();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addOption}>
                    Add
                  </Button>
                </div>
              </div>
            )}

            {sections.length > 0 && (
              <FormField label="Section" description="Groups related fields together on the form.">
                {(props) => (
                  <NativeSelect {...props} value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                    <option value="">No section</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            )}

            {entity.supportsCategories && categories.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Only for these categories</Label>
                <p className="text-[12px] text-foreground-muted">
                  Leave all unticked to use this attribute everywhere.
                </p>
                <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
                  {categories.map((category) => {
                    const id = `cat-${category.id}`;
                    return (
                      <div key={category.id} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={categoryIds.includes(category.id)}
                          onCheckedChange={(checked) =>
                            setCategoryIds((previous) =>
                              checked === true
                                ? [...previous, category.id]
                                : previous.filter((entry) => entry !== category.id),
                            )
                          }
                        />
                        <Label htmlFor={id}>{category.name}</Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Who can see it</Label>
              <p className="text-[12px] text-foreground-muted">Leave all unticked to show it to everyone.</p>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => {
                  const id = `role-${role.key}`;
                  return (
                    <div key={role.key} className="flex items-center gap-1.5">
                      <Checkbox
                        id={id}
                        checked={roleKeys.includes(role.key)}
                        onCheckedChange={(checked) =>
                          setRoleKeys((previous) =>
                            checked === true ? [...previous, role.key] : previous.filter((entry) => entry !== role.key),
                          )
                        }
                      />
                      <Label htmlFor={id}>{role.name}</Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="field-required"
                  checked={isRequired}
                  onCheckedChange={(checked) => setIsRequired(checked === true)}
                />
                <Label htmlFor="field-required">Required field</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="field-hidden" checked={hidden} onCheckedChange={(checked) => setHidden(checked === true)} />
                <Label htmlFor="field-hidden">Hide from forms</Label>
              </div>
            </div>

            {error && <Alert tone="danger">{error}</Alert>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending} disabled={!label.trim() || (needsOptions && options.length === 0)}>
              {isEdit ? "Save changes" : "Add attribute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
