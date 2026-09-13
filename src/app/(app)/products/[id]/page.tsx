import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { formatMoney } from "@/lib/format";
import { AddVariantForm } from "./add-variant-form";

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const product = await db.product.findUnique({
    where: { id },
    include: { category: true, organization: true, variants: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!product) notFound();

  const ctx = await loadTenantContext(user.id, product.organizationId);
  if (!ctx) notFound();

  const { organization } = product;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-semibold">{product.name}</h1>
            <p className="text-sm text-muted-foreground">
              SKU {product.sku}
              {product.category && ` · ${product.category.name}`}
              {product.brand && ` · ${product.brand}`}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">
              {formatMoney(product.sellingPrice.toString(), organization.currencyCode, organization.locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              Cost {formatMoney(product.costPrice.toString(), organization.currencyCode, organization.locale)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Variants</CardTitle>
          {ctx.permissions.has("products.edit") && <AddVariantForm productId={product.id} />}
        </CardHeader>
        <CardContent>
          {product.variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No variants — this product is sold directly using its own SKU and price.
            </p>
          ) : (
            <RevealOnScroll className="flex flex-col gap-2">
              {product.variants.map((variant) => (
                <div key={variant.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{variant.sku}</p>
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(variant.attributes as Record<string, string>)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  </div>
                  {(variant.sellingPrice || variant.costPrice) && (
                    <p className="text-sm tabular-nums">
                      {formatMoney(
                        (variant.sellingPrice ?? product.sellingPrice).toString(),
                        organization.currencyCode,
                        organization.locale,
                      )}
                    </p>
                  )}
                </div>
              ))}
            </RevealOnScroll>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
