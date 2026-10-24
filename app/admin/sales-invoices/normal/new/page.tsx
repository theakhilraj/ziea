import { redirect } from "next/navigation";
import NormalInvoiceForm from "@/components/client/admin/NormalInvoiceForm";
import type { BillingParty, BillingProduct, IssuerCompany } from "@/utils/billing";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "New Normal Invoice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewNormalInvoicePage() {
  const supabase = await createClient();
  const [companiesRes, partiesRes, productsRes] = await Promise.all([
    supabase.from("issuer_companies").select("*").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
    supabase.from("billing_parties").select("*").order("name"),
    supabase.from("products").select("id, name, product_code, hsn_sac, gst_rate, uom, original_price, discounted_price").order("name"),
  ]);
  if (companiesRes.error) throw companiesRes.error;
  if (partiesRes.error) throw partiesRes.error;
  if (productsRes.error) throw productsRes.error;
  const companies = (companiesRes.data ?? []) as IssuerCompany[];
  if (!companies.length) redirect("/admin/sales-invoices/settings");

  const products: BillingProduct[] = (productsRes.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    product_code: product.product_code,
    hsn_sac: product.hsn_sac,
    gst_rate: product.gst_rate,
    uom: product.uom,
    price: product.discounted_price ?? product.original_price ?? null,
  }));
  return <NormalInvoiceForm companies={companies} parties={(partiesRes.data ?? []) as BillingParty[]} products={products} />;
}
