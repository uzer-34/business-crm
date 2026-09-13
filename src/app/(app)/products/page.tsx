import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { formatMoney } from "@/lib/format";
import { NewProductForm } from "./new-product-form";

export default async function ProductsPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;

  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { organizationId: organization.id, archivedAt: null },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.category.findMany({
      where: { organizationId: organization.id, kind: "PRODUCT", archivedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">{products.length} total</p>
        </div>
        <NewProductForm organizationId={organization.id} categoryNames={categories.map((c) => c.name)} />
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No products yet. Add your first one to start building a catalog.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {products.map((product) => (
            <HoverLift key={product.id}>
              <Link href={`/products/${product.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        SKU {product.sku}
                        {product.category && ` · ${product.category.name}`}
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">
                      {formatMoney(product.sellingPrice.toString(), organization.currencyCode, organization.locale)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </HoverLift>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}
