"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MdAdd, MdArrowBack, MdDelete } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import Toast from "@/components/ui/Toast";
import { InvoiceDatePicker } from "@/components/client/admin/InvoiceDatePicker";
import { InvoiceProductPicker } from "@/components/client/admin/InvoiceProductPicker";
import { createClient } from "@/utils/supabase/client";
import type { BillingParty, BillingProduct, IssuerCompany, SaleInvoice, SaleInvoiceItem } from "@/utils/billing";
import { financialYear, round2 } from "@/utils/gst";

type DraftLine = {
  key: string;
  productId: string;
  description: string;
  unitPrice: string;
  qty: string;
  discountType: "amount" | "percent";
  discountValue: string;
};

type PartyDraft = {
  name: string;
  phone: string;
  address: string;
  email: string;
};

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const hasPrecision = (value: string, decimals: number) => {
  const scaled = Number(value) * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-7;
};
const getErrorMessage = (cause: unknown, fallback: string) => {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string") {
    const details = "details" in cause && typeof cause.details === "string" ? cause.details : "";
    return details ? `${cause.message} ${details}` : cause.message;
  }
  return fallback;
};
const inr = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FIELD = "w-full rounded-xl border border-[#d6c3b3] bg-white px-3 py-2.5 text-sm text-[#2C3829] outline-none focus:border-[#7A9268] focus:ring-2 focus:ring-[#7A9268]/10";
const LABEL = "mb-1 block text-sm font-medium text-[#2C3829]";
const newLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  productId: "",
  description: "",
  unitPrice: "",
  qty: "1",
  discountType: "amount",
  discountValue: "",
});
const getLineAmounts = (line: DraftLine) => {
  const gross = round2((Number(line.unitPrice) || 0) * (Number(line.qty) || 0));
  const discountValue = Number(line.discountValue) || 0;
  const discount = round2(line.discountType === "percent" ? gross * discountValue / 100 : discountValue);
  return { gross, discount, total: round2(Math.max(gross - discount, 0)) };
};

export default function NormalInvoiceForm({
  companies,
  parties,
  products,
  initial,
}: {
  companies: IssuerCompany[];
  parties: BillingParty[];
  products: BillingProduct[];
  initial?: { invoice: SaleInvoice; items: SaleInvoiceItem[] };
}) {
  const router = useRouter();
  const supabase = createClient();
  const invoice = initial?.invoice;
  const defaultCompany = companies.find((company) => company.is_default) ?? companies[0];
  const [issuerId, setIssuerId] = useState(invoice?.issuer_company_id ?? defaultCompany.id);
  const [partyId, setPartyId] = useState(invoice?.billing_party_id ?? "");
  const [customer, setCustomer] = useState<PartyDraft>({
    name: invoice?.party_name ?? "",
    phone: invoice?.party_phone ?? "",
    address: invoice?.party_address ?? "",
    email: invoice?.party_email ?? "",
  });
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoice_date ?? today());
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [manualNumber, setManualNumber] = useState(false);
  const [customInvoiceNo, setCustomInvoiceNo] = useState("");
  const [saveCustomer, setSaveCustomer] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(
    initial
      ? initial.items.map((item) => ({
          key: item.id,
          productId: item.product_id ?? "",
          description: item.name,
          unitPrice: String(item.unit_price),
          qty: String(item.qty),
          discountType: item.discount_type === "percent" ? "percent" : "amount",
          discountValue: Number(item.discount_value) ? String(item.discount_value) : "",
        }))
      : [newLine()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", show: false, error: false });
  const issuer = companies.find((company) => company.id === issuerId) ?? defaultCompany;
  const invoicePrefix = issuer.invoice_prefix || "INV";
  const fy = invoiceDate ? financialYear(invoiceDate) : "";
  const phoneError = phoneTouched && customer.phone.length !== 10
    ? "Enter a valid 10-digit phone number."
    : "";
  const emailError = emailTouched && customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())
    ? "Enter a valid email address."
    : "";
  const totals = useMemo(() => {
    return lines.reduce(
      (sum, line) => {
        const amounts = getLineAmounts(line);
        return {
          subtotal: round2(sum.subtotal + amounts.gross),
          discount: round2(sum.discount + amounts.discount),
          total: round2(sum.total + amounts.total),
        };
      },
      { subtotal: 0, discount: 0, total: 0 },
    );
  }, [lines]);

  const showToast = (message: string, isError = false) => {
    setToast({ message, show: true, error: isError });
    window.setTimeout(() => setToast({ message: "", show: false, error: false }), 4000);
  };
  const updateLine = (key: string, changes: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line));
  };
  const selectParty = (id: string) => {
    setPartyId(id);
    const selected = parties.find((party) => party.id === id);
    if (selected) {
      setCustomer({
        name: selected.name ?? "",
        phone: selected.phone ?? "",
        address: selected.address ?? "",
        email: selected.email ?? "",
      });
    } else {
      setCustomer({ name: "", phone: "", address: "", email: "" });
    }
  };
  const typeProduct = (key: string, description: string) => {
    const product = products.find((item) => item.name === description);
    updateLine(key, {
      productId: product?.id ?? "",
      description,
      unitPrice: product?.price == null ? "" : String(product.price),
    });
  };
  const selectProduct = (key: string, product: BillingProduct) => {
    updateLine(key, {
      productId: product.id,
      description: product.name,
      unitPrice: product.price == null ? "" : String(product.price),
    });
  };

  const save = async () => {
    setError("");
    if (!issuerId) return showToast("Choose the issuing company.", true);
    if (!customer.name.trim()) return showToast("Enter the customer name.", true);
    if (!customer.phone.trim()) return showToast("Enter the customer phone number.", true);
    if (!/^\d{10}$/.test(customer.phone)) return showToast("Enter a valid 10-digit phone number.", true);
    if (!customer.address.trim()) return showToast("Enter the customer address.", true);
    if (!invoiceDate) return showToast("Choose the invoice date.", true);
    if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
      return showToast("Enter a valid customer email address.", true);
    }
    if (manualNumber && !customInvoiceNo.trim()) {
      return showToast("Enter the invoice number sequence.", true);
    }
    const enteredLines = lines.filter((line) =>
      line.productId || line.description.trim() || line.qty.trim() || line.unitPrice.trim() || line.discountValue.trim()
    );
    if (!enteredLines.length) return showToast("Add at least one invoice item.", true);
    const validLines = enteredLines.filter((line) =>
      line.description.trim() &&
      line.qty.trim() !== "" &&
      line.unitPrice.trim() !== "" &&
      Number.isFinite(Number(line.qty)) &&
      Number.isFinite(Number(line.unitPrice)) &&
      Number(line.qty) > 0 &&
      Number(line.unitPrice) >= 0 &&
      hasPrecision(line.qty, 3) &&
      hasPrecision(line.unitPrice, 2)
    );
    if (validLines.length !== enteredLines.length) {
      return showToast("Complete each item with a description, quantity (up to 3 decimals), and unit price (up to 2 decimals).", true);
    }
    const invalidDiscount = validLines.some((line) => {
      const value = Number(line.discountValue) || 0;
      const gross = round2(Number(line.qty) * Number(line.unitPrice));
      return value < 0 ||
        !hasPrecision(line.discountValue || "0", 2) ||
        (line.discountType === "percent" ? value > 100 : value > gross);
    });
    if (invalidDiscount) {
      return showToast("Discount must be up to 100% or no more than the item subtotal, with up to 2 decimals.", true);
    }
    if (invoiceDate > today()) return showToast("Invoice date cannot be in the future.", true);

    setBusy(true);
    try {
      let usePartyId = partyId || null;
      if (!usePartyId && saveCustomer) {
        const { data, error: partyError } = await supabase
          .from("billing_parties")
          .insert({
            name: customer.name.trim(),
            phone: customer.phone.trim(),
            address: customer.address.trim(),
            email: customer.email.trim() || null,
          })
          .select("id")
          .single();
        if (partyError) throw partyError;
        usePartyId = data.id;
      }

      const normalizedItems = validLines.map((line) => {
        const qty = Number(line.qty);
        const unitPrice = Number(line.unitPrice);
        const { gross, discount, total } = getLineAmounts(line);
        return {
          product_id: line.productId || null,
          name: line.description.trim(),
          hsn_sac: null,
          uom: null,
          qty,
          unit_price: unitPrice,
          discount_type: line.discountType,
          discount_value: Number(line.discountValue) || 0,
          gst_rate: 0,
          taxable_amount: round2(gross - discount),
          cgst_amount: 0,
          sgst_amount: 0,
          igst_amount: 0,
          line_total: total,
        };
      });
      const grandTotal = round2(normalizedItems.reduce((sum, item) => sum + item.line_total, 0));
      const subtotal = round2(normalizedItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0));
      const { data, error: saveError } = await supabase.rpc("save_normal_sale_invoice", {
        p_invoice_id: invoice?.id ?? null,
        p_company_id: issuerId,
        p_party_id: usePartyId,
        p_header: {
          invoice_date: invoiceDate,
          custom_invoice_no: manualNumber ? customInvoiceNo.trim() : null,
          party_name: customer.name.trim(),
          party_phone: customer.phone.trim(),
          party_address: customer.address.trim(),
          party_email: customer.email.trim() || null,
          subtotal,
          grand_total: grandTotal,
          amount_paid: invoice?.amount_paid ?? 0,
          status: "saved",
        },
        p_items: normalizedItems,
      });
      if (saveError) throw saveError;
      const saved = data as { id?: string; invoice_no?: string };
      const { data: auth } = await supabase.auth.getUser();
      const { error: activityError } = await supabase.from("activity_logs").insert({
        user_id: auth.user?.id,
        type: invoice ? "Invoice Updated" : "Invoice Created",
        description: `Admin ${invoice ? "updated" : "created"} normal invoice ${saved.invoice_no ?? ""} for "${customer.name.trim()}" (₹${inr(grandTotal)})`,
      });
      if (activityError) console.error("Could not log normal invoice activity:", activityError.message);
      showToast(`Invoice ${saved.invoice_no ?? ""} ${invoice ? "updated" : "created"}`);
      window.setTimeout(() => {
        router.push(saved.id ? `/admin/sales-invoices/${saved.id}` : "/admin/sales-invoices");
        router.refresh();
      }, 500);
    } catch (cause) {
      const message = getErrorMessage(cause, "Could not save normal invoice.");
      setError(message);
      showToast(message, true);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 pb-8 pt-20 lg:px-10 lg:pt-6">
      <Toast show={toast.show} message={toast.message} error={toast.error} />
      <div className="mb-6 flex items-center gap-4 border-b border-[#d6c3b3]/30 pb-5">
        <Link href="/admin/sales-invoices" aria-label="Back to Sales Invoices" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d6c3b3]/30 bg-white text-[#2C3829]">
          <MdArrowBack className="text-xl" />
        </Link>
        <div>
          <h1 className="font-jost text-2xl font-bold text-[#2C3829]">{invoice ? "Edit Normal Invoice" : "New Normal Invoice"}</h1>
          <p className="text-sm text-[#2C3829]/60">Tax-free invoice for your customer.</p>
        </div>
      </div>
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="space-y-6">
        <div className="w-full space-y-4 rounded-2xl bg-white p-5 shadow-[0px_2px_16px_rgba(44,56,41,0.08)] sm:p-6">
            <h2 className="border-b border-[#d6c3b3]/25 pb-3 font-jost text-lg font-semibold text-[#2C3829]">Customer and invoice</h2>
            <Select
              label="Issued by"
              value={issuerId}
              onChange={setIssuerId}
              disabled={!!invoice}
              allowNone={false}
              options={companies.map((company) => ({
                value: company.id,
                label: `${company.name}${company.is_default ? " (default)" : ""}`,
              }))}
            />
            {parties.length > 0 && !invoice && (
              <Select
                label="Select saved customer (optional)"
                value={partyId}
                onChange={selectParty}
                placeholder="Enter a new customer"
                allowNone={false}
                options={parties.map((party) => ({
                  value: party.id,
                  label: `${party.name}${party.phone ? ` · ${party.phone}` : ""}`,
                }))}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["Customer name *", "name"],
                ["Phone number *", "phone"],
                ["Email (optional)", "email"],
              ] as const).map(([label, key]) => (
                <label key={key} className="block">
                  <span className={LABEL}>{label}</span>
                  <input
                    className={`${FIELD} ${(key === "phone" && phoneError) || (key === "email" && emailError) ? "border-red-500 focus:border-red-500 focus:ring-red-500/10" : ""}`}
                    value={customer[key]}
                    type={key === "email" ? "email" : "text"}
                    inputMode={key === "phone" ? "numeric" : undefined}
                    maxLength={key === "phone" ? 10 : undefined}
                    aria-invalid={Boolean((key === "phone" && phoneError) || (key === "email" && emailError))}
                    onBlur={() => {
                      if (key === "phone") setPhoneTouched(true);
                      if (key === "email") setEmailTouched(true);
                    }}
                    onChange={(event) => setCustomer((value) => ({
                      ...value,
                      [key]: key === "phone" ? event.target.value.replace(/\D/g, "") : event.target.value,
                    }))}
                  />
                  {key === "phone" && phoneError && <span className="mt-1 block text-xs text-red-600">{phoneError}</span>}
                  {key === "email" && emailError && <span className="mt-1 block text-xs text-red-600">{emailError}</span>}
                </label>
              ))}
              <InvoiceDatePicker
                label="Invoice date *"
                value={invoiceDate}
                onChange={setInvoiceDate}
                minISO={`${Number(today().slice(0, 4)) - 5}-01-01`}
                maxISO={today()}
                todayISO={today()}
              />
              <label className="block sm:col-span-2">
                <span className={LABEL}>Address *</span>
                <textarea className={`${FIELD} min-h-24 resize-y`} value={customer.address} onChange={(event) => setCustomer((value) => ({ ...value, address: event.target.value }))} />
              </label>
            </div>
            {invoice ? (
              <p className="text-sm text-[#2C3829]/70">
                Invoice number: <span className="font-semibold text-[#2C3829]">{invoice.invoice_no}</span>{" "}
                <span className="text-[#2C3829]/50">(fixed)</span>
              </p>
            ) : (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-[#2C3829]">
                  <input type="checkbox" checked={manualNumber} onChange={(event) => setManualNumber(event.target.checked)} className="h-4 w-4 accent-[#7A9268]" />
                  Set invoice number manually
                </label>
                {manualNumber ? (
                  <div className="max-w-md">
                    <span className={LABEL}>Invoice number</span>
                    <div className="flex overflow-hidden rounded-xl border border-[#d6c3b3] bg-white focus-within:border-[#7A9268] focus-within:ring-2 focus-within:ring-[#7A9268]/10">
                      <span className="flex items-center whitespace-nowrap border-r border-[#d6c3b3] bg-[#F5F0E8] px-3 text-sm font-medium text-[#2C3829]/70">{invoicePrefix}/{fy}/N/</span>
                      <input
                        className="min-w-0 flex-1 px-3 py-2.5 text-sm text-[#2C3829] outline-none"
                        inputMode="numeric"
                        value={customInvoiceNo}
                        placeholder="0001"
                        onChange={(event) => setCustomInvoiceNo(event.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <p className="mt-1 text-xs text-[#2C3829]/50">Enter the sequence only; the company prefix and financial year are added automatically.</p>
                  </div>
                ) : (
                  <p className="text-xs text-[#2C3829]/60">
                    Invoice number is assigned on save, for example{" "}
                    <span className="font-medium text-[#2C3829]">{invoicePrefix}/{fy}/N/0001</span>.
                    The next sequence is shared with GST invoices for this company and financial year.
                  </p>
                )}
              </div>
            )}
            {!partyId && !invoice && (
              <label className="flex items-center gap-2 text-sm text-[#2C3829]">
                <input type="checkbox" checked={saveCustomer} onChange={(event) => setSaveCustomer(event.target.checked)} className="accent-[#7A9268]" />
                Save this customer for later invoices
              </label>
            )}
        </div>
      </div>

      <section className="mt-8 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-[#d6c3b3]/30 pb-3">
          <h2 className="font-jost text-lg font-semibold text-[#2C3829]">Invoice items</h2>
          <Button type="button" variant="auth-social" className="!w-auto !py-2 !px-3 !text-xs" onClick={() => setLines((current) => [...current, newLine()])}>
            <MdAdd /> Add item
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#d6c3b3]/30 bg-white lg:overflow-visible">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[#d6c3b3]/30 bg-[#F5F0E8]/60 text-left text-[11px] font-semibold uppercase tracking-wider text-[#2C3829]/60">
                <th className="w-12 px-4 py-3">#</th>
                <th className="px-3 py-3">Description</th>
                <th className="w-36 px-3 py-3 text-right">Unit price</th>
                <th className="w-28 px-3 py-3 text-right">Qty</th>
                <th className="w-44 px-3 py-3 text-right">Item discount</th>
                <th className="w-36 px-3 py-3 text-right">Total</th>
                <th className="w-12 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key} className="border-b border-[#d6c3b3]/20 last:border-0">
                  <td className="px-4 py-2.5 text-[#2C3829]/50">{index + 1}</td>
                  <td className="px-3 py-2.5">
                    <InvoiceProductPicker
                      value={line.description}
                      products={products}
                      onType={(description) => typeProduct(line.key, description)}
                      onPick={(product) => selectProduct(line.key, product)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      className="h-10 w-full rounded-lg border border-[#d6c3b3] bg-white px-3 text-right text-sm text-[#2C3829] outline-none focus:border-[#7A9268] focus:ring-2 focus:ring-[#7A9268]/10"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.key, { unitPrice: event.target.value.replace(/[^\d.]/g, "") })}
                      aria-label={`Unit price for item ${index + 1}`}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      className="h-10 w-full rounded-lg border border-[#d6c3b3] bg-white px-3 text-right text-sm text-[#2C3829] outline-none focus:border-[#7A9268] focus:ring-2 focus:ring-[#7A9268]/10"
                      inputMode="decimal"
                      value={line.qty}
                      onChange={(event) => updateLine(line.key, { qty: event.target.value.replace(/[^\d.]/g, "") })}
                      aria-label={`Quantity for item ${index + 1}`}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <input
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#d6c3b3] bg-white px-2 text-right text-sm text-[#2C3829] outline-none focus:border-[#7A9268] focus:ring-2 focus:ring-[#7A9268]/10"
                        inputMode="decimal"
                        value={line.discountValue}
                        placeholder="0"
                        onChange={(event) => updateLine(line.key, { discountValue: event.target.value.replace(/[^\d.]/g, "") })}
                        aria-label={`Item discount for item ${index + 1}`}
                      />
                      <button
                        type="button"
                        aria-label={`Discount type for item ${index + 1}: ${line.discountType === "amount" ? "amount" : "percentage"}`}
                        onClick={() => updateLine(line.key, { discountType: line.discountType === "amount" ? "percent" : "amount" })}
                        className="h-10 w-10 shrink-0 rounded-lg border border-[#d6c3b3] bg-white text-xs font-semibold text-[#2C3829] hover:bg-[#F5F0E8]"
                      >
                        {line.discountType === "amount" ? "₹" : "%"}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-[#2C3829]">
                    ₹{inr(getLineAmounts(line).total)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button type="button" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="flex h-10 w-10 items-center justify-center rounded-full text-[#2C3829]/60 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                      <MdDelete className="text-lg" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#d6c3b3]/30 bg-[#F5F0E8]/40">
                <td colSpan={5} className="px-4 py-3 text-right font-semibold text-[#2C3829]">Total</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#2C3829]">₹{inr(totals.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex justify-end">
          <div className="w-full space-y-3 sm:w-72">
            <Button type="button" variant="auth-primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : invoice ? "Save changes" : "Create Normal Invoice"}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
