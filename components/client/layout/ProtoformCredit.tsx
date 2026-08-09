"use client";

import { useState } from "react";
import Image from "next/image";
import { z } from "zod";
import { MdClose, MdOutlineMail } from "react-icons/md";
import Toast from "@/components/ui/Toast";
import { sendProtoformEnquiry } from "@/app/actions/protoform";

// Client-side mirror of the server schema so users get instant feedback.
const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^(?:\+?\d[\d\s-]{6,18}\d)$/.test(v), "Enter a valid phone number."),
  message: z.string().trim().max(2000),
});

type Errors = Partial<Record<"name" | "email" | "phone" | "message", string>>;

export default function ProtoformCredit({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", error: false });

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setErrors({});
  };

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setMessage("");
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const result = schema.safeParse({ name, email, phone, message });
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setErrors({
        name: flat.name?.[0],
        email: flat.email?.[0],
        phone: flat.phone?.[0],
        message: flat.message?.[0],
      });
      return;
    }
    setErrors({});
    setSubmitting(true);

    const res = await sendProtoformEnquiry({ name, email, phone, message });
    setSubmitting(false);

    if (res.ok) {
      setToast({ show: true, message: "Thank you! We'll get back to you soon.", error: false });
      reset();
      setOpen(false);
    } else {
      setToast({ show: true, message: res.error, error: true });
    }
    setTimeout(() => setToast({ show: false, message: "", error: false }), 2600);
  };

  const inputCls = (bad?: string) =>
    `w-full h-11 rounded-xl border bg-white px-3 font-jost text-sm text-[#2C3829] outline-none transition-colors ${bad ? "border-red-400 focus:border-red-500" : "border-[#d6c3b3] focus:border-primary"
    }`;

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Footer credit — the Protoform logo is the clickable trigger */}
      <p className={className ?? "text-left text-[11px] uppercase tracking-[0.18em] text-white/50"}>
        Crafted by{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Contact Protoform Technologies"
          className="inline-block align-middle ml-1.5 opacity-80 hover:opacity-100 transition-opacity"
        >
          <Image
            src="/protoform-logo-white.png"
            alt="Protoform Technologies"
            width={355}
            height={105}
            className="inline-block h-8 w-auto"
          />
        </button>
      </p>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Contact Protoform Technologies"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={close}
          />

          {/* Panel — bottom sheet on mobile, centered dialog on desktop */}
          <div className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 animate-in slide-in-from-bottom sm:zoom-in-95 fade-in duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="cormorant text-2xl text-primary-dark">Work with Protoform</h3>
                <p className="text-xs text-[#2C3829]/60 mt-1">
                  Tell us about your project - we&apos;ll reply by email.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[#2C3829]/60 hover:bg-[#2C3829]/5 transition-colors shrink-0"
              >
                <MdClose className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="Your name"
                  aria-invalid={!!errors.name}
                  className={inputCls(errors.name)}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                  }}
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  className={inputCls(errors.email)}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">
                  Phone <span className="text-[#2C3829]/40">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  placeholder="+91 …"
                  aria-invalid={!!errors.phone}
                  className={inputCls(errors.phone)}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>

              <div>
                <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">
                  Description <span className="text-[#2C3829]/40">(optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (errors.message) setErrors((p) => ({ ...p, message: undefined }));
                  }}
                  rows={4}
                  placeholder="What would you like to build?"
                  aria-invalid={!!errors.message}
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 font-jost text-sm text-[#2C3829] outline-none transition-colors resize-none ${errors.message ? "border-red-400 focus:border-red-500" : "border-[#d6c3b3] focus:border-primary"
                    }`}
                />
                {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message}</p>}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-full bg-[#2C3829] text-white font-jost font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 transition-all shadow-sm"
              >
                <MdOutlineMail className="text-lg" />
                {submitting ? "Sending…" : "Send enquiry"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
