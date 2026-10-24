import { notFound, redirect } from "next/navigation";
import NormalInvoiceForm from "@/components/client/admin/NormalInvoiceForm";
import type { BillingParty, BillingProduct, IssuerCompany, SaleInvoice, SaleInvoiceItem } from "@/utils/billing";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Edit Normal Invoice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditNormalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: invoice, error: invoiceError } = await supabase.from("sale_invoices").select("*").eq("id", id).single();
  if (invoiceError || !invoice) notFound();
  if (invoice.invoice_kind !== "normal") notFound();
  if (invoice.status === "cancelled") redirect(`/admin/sales-invoices/${id}`);

  const [itemsRes, companiesRes, partiesRes, productsRes] = await Promise.all([
    supabase.from("sale_invoice_items").select("*").eq("invoice_id", id).order("line_no", { ascending: true }),
    supabase.from("issuer_companies").select("*").order("is_default", { ascending: false }).order("name"),
    supabase.from("billing_parties").select("*").order("name"),
    supabase.from("products").select("id, name, product_code, hsn_sac, gst_rate, uom, original_price, discounted_price").order("name"),
  ]);
  for (const result of [itemsRes, companiesRes, partiesRes, productsRes]) {
    if (result.error) throw result.error;
  }
  const products: BillingProduct[] = (productsRes.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    product_code: product.product_code,
    hsn_sac: product.hsn_sac,
    gst_rate: product.gst_rate,
    uom: product.uom,
    price: product.discounted_price ?? product.original_price ?? null,
  }));
  return (
    <NormalInvoiceForm
      companies={(companiesRes.data ?? []) as IssuerCompany[]}
      parties={(partiesRes.data ?? []) as BillingParty[]}
      products={products}
      initial={{
        invoice: invoice as SaleInvoice,
        items: (itemsRes.data ?? []) as SaleInvoiceItem[],
      }}
    />
  );
}
