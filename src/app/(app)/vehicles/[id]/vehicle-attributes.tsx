"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DynamicForm, type DynamicSection, type DynamicValues } from "@/components/metadata/dynamic-form";
import { installVehicleAttributesAction, saveVehicleAttributesAction } from "@/lib/vehicles/vehicle-actions";

/**
 * The Vehicle proof.
 *
 * Registration number, VIN, engine number, fuel, transmission, mileage,
 * insurance and warranty are not fields on this page — they are attribute
 * templates the workshop installs once, after which DynamicForm renders them.
 */
export function VehicleAttributes({
  vehicleId,
  organizationId,
  sections,
  initialValues,
  canConfigure,
  canEdit,
}: {
  vehicleId: string;
  organizationId: string;
  sections: DynamicSection[];
  initialValues: DynamicValues;
  canConfigure: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<DynamicValues>(initialValues);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const install = () => {
    setError(null);
    startTransition(async () => {
      const result = await installVehicleAttributesAction(organizationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Added ${result.data.createdCount} vehicle attributes.`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle details</CardTitle>
        <CardDescription>Everything this workshop records about a vehicle.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sections.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No vehicle details configured yet"
            description={
              canConfigure
                ? "Install the standard set — registration, VIN, engine number, fuel, transmission, mileage, insurance and warranty — or build your own in Settings → Attributes."
                : "An owner can configure these in Settings → Attributes."
            }
            action={
              canConfigure ? (
                <Button size="sm" loading={isPending} onClick={install}>
                  Install standard vehicle details
                </Button>
              ) : undefined
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
                const result = await saveVehicleAttributesAction(vehicleId, values);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setNotice("Vehicle details saved.");
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
            {notice && <Alert tone="success">{notice}</Alert>}
            {canEdit && (
              <div>
                <Button type="submit" size="sm" loading={isPending}>
                  {isPending ? "Saving…" : "Save details"}
                </Button>
              </div>
            )}
          </form>
        )}

        {sections.length === 0 && error && <Alert tone="danger">{error}</Alert>}
        {sections.length === 0 && notice && <Alert tone="success">{notice}</Alert>}
      </CardContent>
    </Card>
  );
}
