import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { PageHeader } from "@/components/ui/layout";
import { Card, CardContent } from "@/components/ui/card";
import { describeListView } from "@/lib/list-view/query";
import { getProductList, parseProductListQuery, PRODUCT_LIST_CONFIG } from "@/lib/catalog/product-list";
import type { FilterDefinition } from "@/components/data-table/filter-bar";
import { ProductsTable } from "./products-table";
import { NewProductForm } from "./new-product-form";

const SORT_LABELS: Record<string, string> = {
  name: "Product",
  sku: "SKU",
  sellingPrice: "Price",
  createdAt: "Created",
};

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;
  const ctx = await loadTenantContext(user.id, organization.id);

  if (!ctx || !ctx.permissions.has("products.view")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-[13px] text-foreground-muted">
          You don&apos;t have permission to view products.
        </CardContent>
      </Card>
    );
  }

  const params = await searchParams;
  const query = parseProductListQuery(params);

  const [result, categories, suppliers] = await Promise.all([
    getProductList(organization.id, query),
    db.category.findMany({
      where: { organizationId: organization.id, kind: "PRODUCT", archivedAt: null },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: { organizationId: organization.id, archivedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const filters: FilterDefinition[] = [
    {
      key: "categoryId",
      label: "Category",
      options: categories.map((category) => ({ value: category.id, label: category.name })),
    },
    { key: "archived", label: "Archived", options: [{ value: "true", label: "Archived only" }] },
  ];

  const summary = describeListView({
    total: result.total,
    noun: "product",
    pluralNoun: "products",
    search: query.search,
    sortLabel: SORT_LABELS[query.sort ?? PRODUCT_LIST_CONFIG.defaultSort],
    filterLabels: filters.filter((filter) => query.filters[filter.key]).map((filter) => filter.label),
  });

  const canCreate = ctx.permissions.has("products.create");

  // Separate instances so ?new=1 opens exactly one dialog — see the same note
  // on the customers page.
  const renderCreateForm = (autoOpen: boolean) =>
    canCreate ? (
      <NewProductForm
        organizationId={organization.id}
        categoryNames={categories.map((category) => category.name)}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        defaultOpen={autoOpen}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Products" actions={renderCreateForm(params.new === "1")} />
      <ProductsTable
        rows={result.rows}
        result={result}
        query={query}
        summary={summary}
        filters={filters}
        currencyCode={organization.currencyCode}
        locale={organization.locale}
        canEdit={ctx.permissions.has("products.edit")}
        createSlot={renderCreateForm(false)}
      />
    </div>
  );
}
