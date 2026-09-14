"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createOrderAction } from "@/lib/sales/order-actions";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  taxRatePercent: string;
  variants: { id: string; sku: string }[];
};
type ServiceOption = { id: string; name: string; price: string; taxRatePercent: string };

type LineItem = {
  kind: "product" | "service";
  productId: string;
  variantId: string;
  serviceId: string;
  quantityOrdered: string;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: string;
};

function emptyLine(products: ProductOption[], services: ServiceOption[]): LineItem {
  if (products.length > 0) {
    return {
      kind: "product",
      productId: products[0].id,
      variantId: "",
      serviceId: "",
      quantityOrdered: "1",
      unitPrice: products[0].sellingPrice,
      discountPercent: "0",
      taxRatePercent: products[0].taxRatePercent,
    };
  }
  return {
    kind: "service",
    productId: "",
    variantId: "",
    serviceId: services[0]?.id ?? "",
    quantityOrdered: "1",
    unitPrice: services[0]?.price ?? "",
    discountPercent: "0",
    taxRatePercent: services[0]?.taxRatePercent ?? "0",
  };
}

type VehicleOption = { id: string; customerId: string; label: string };

export function NewOrderForm({
  organizationId,
  branches,
  customers,
  members,
  products,
  services,
  initialCustomerId,
  vehicles = [],
  trackVehicles = false,
}: {
  organizationId: string;
  branches: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  members: { id: string; label: string }[];
  products: ProductOption[];
  services: ServiceOption[];
  initialCustomerId?: string;
  vehicles?: VehicleOption[];
  trackVehicles?: boolean;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [assignedToId, setAssignedToId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [odometerReading, setOdometerReading] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyLine(products, services)]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const vehiclesForCustomer = vehicles.filter((v) => v.customerId === customerId);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function setItemKind(index: number, kind: "product" | "service") {
    if (kind === "product" && products.length > 0) {
      const p = products[0];
      updateItem(index, { kind, productId: p.id, variantId: "", serviceId: "", unitPrice: p.sellingPrice, taxRatePercent: p.taxRatePercent });
    } else if (kind === "service" && services.length > 0) {
      const s = services[0];
      updateItem(index, { kind, serviceId: s.id, productId: "", variantId: "", unitPrice: s.price, taxRatePercent: s.taxRatePercent });
    }
  }

  const canSubmit =
    branchId &&
    items.length > 0 &&
    items.every(
      (item) =>
        (item.kind === "product" ? item.productId : item.serviceId) &&
        Number(item.quantityOrdered) > 0 &&
        item.unitPrice !== "",
    );

  if (products.length === 0 && services.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add a product or service first.
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createOrderAction(organizationId, {
            branchId,
            customerId: customerId || undefined,
            assignedToId: assignedToId || undefined,
            vehicleId: vehicleId || undefined,
            odometerReading: odometerReading || undefined,
            items: items.map((item) => ({
              productId: item.kind === "product" ? item.productId : undefined,
              variantId: item.kind === "product" ? item.variantId || undefined : undefined,
              serviceId: item.kind === "service" ? item.serviceId : undefined,
              quantityOrdered: item.quantityOrdered,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              taxRatePercent: item.taxRatePercent,
            })),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/orders/${result.data.orderId}`);
        });
      }}
    >
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-branch">Branch</Label>
            <select
              id="order-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-customer">Customer (optional)</Label>
            <select
              id="order-customer"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setVehicleId("");
              }}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              <option value="">Walk-in</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {trackVehicles && customerId && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-vehicle">Vehicle (optional)</Label>
                <select
                  id="order-vehicle"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                >
                  <option value="">None</option>
                  {vehiclesForCustomer.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-odometer">Odometer reading (optional)</Label>
                <Input
                  id="order-odometer"
                  type="number"
                  min="0"
                  value={odometerReading}
                  onChange={(e) => setOdometerReading(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-assignee">Handled by (optional)</Label>
            <select
              id="order-assignee"
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <h2 className="text-sm font-semibold">Line items</h2>
          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.productId);
            return (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-12">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Type</Label>
                  <select
                    value={item.kind}
                    onChange={(e) => setItemKind(index, e.target.value as "product" | "service")}
                    className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                  >
                    {products.length > 0 && <option value="product">Product</option>}
                    {services.length > 0 && <option value="service">Service</option>}
                  </select>
                </div>

                {item.kind === "product" ? (
                  <div className="flex flex-col gap-1.5 sm:col-span-3">
                    <Label>Product</Label>
                    <select
                      value={item.productId}
                      onChange={(e) => {
                        const p = products.find((pr) => pr.id === e.target.value);
                        updateItem(index, {
                          productId: e.target.value,
                          variantId: "",
                          unitPrice: p?.sellingPrice ?? item.unitPrice,
                          taxRatePercent: p?.taxRatePercent ?? item.taxRatePercent,
                        });
                      }}
                      className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 sm:col-span-3">
                    <Label>Service</Label>
                    <select
                      value={item.serviceId}
                      onChange={(e) => {
                        const s = services.find((sv) => sv.id === e.target.value);
                        updateItem(index, {
                          serviceId: e.target.value,
                          unitPrice: s?.price ?? item.unitPrice,
                          taxRatePercent: s?.taxRatePercent ?? item.taxRatePercent,
                        });
                      }}
                      className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {item.kind === "product" && product && product.variants.length > 0 && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label>Variant</Label>
                    <select
                      value={item.variantId}
                      onChange={(e) => updateItem(index, { variantId: e.target.value })}
                      className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                    >
                      <option value="">Base</option>
                      {product.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.sku}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    value={item.quantityOrdered}
                    onChange={(e) => updateItem(index, { quantityOrdered: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <Label>Disc %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.discountPercent}
                    onChange={(e) => updateItem(index, { discountPercent: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <Label>Tax %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.taxRatePercent}
                    onChange={(e) => updateItem(index, { taxRatePercent: e.target.value })}
                  />
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={items.length === 1}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setItems((prev) => [...prev, emptyLine(products, services)])}
          >
            Add line item
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={!canSubmit || isPending}>
          {isPending ? "Creating…" : "Create order"}
        </Button>
      </div>
    </form>
  );
}
