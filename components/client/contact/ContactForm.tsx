"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  MdOutlineSync,
  MdOutlineCheckCircle,
} from "react-icons/md";
import { FiSend } from "react-icons/fi";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { createClient } from "@/utils/supabase/client";

type InquiryType = "collaboration" | "business" | "personal";

const INQUIRY_LABELS: Record<InquiryType, string> = {
  collaboration: "Collaboration",
  business: "Business",
  personal: "Personal",
};

const INQUIRY_ACTIVITY_LABELS: Record<InquiryType, string> = {
  collaboration: "collaboration",
  business: "business",
  personal: "personal",
};

const MESSAGE_PLACEHOLDERS: Record<InquiryType, string> = {
  collaboration: "Tell us about your collaboration idea...",
  business: "Tell us about your business enquiry...",
  personal: "Share your personal message with us...",
};

const isInquiryType = (v: string | null): v is InquiryType =>
  v === "collaboration" || v === "business" || v === "personal";

export default function ContactForm() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  // Deep links like /contact-us?type=collaboration (Bulk Orders) or
  // /contact-us?type=personal (Customization Studio) pre-select the tab.
  const typeParam = searchParams.get("type");

  const [formState, setFormState] = useState<
    "idle" | "sending" | "sent"
  >("idle");

  const [inquiryType, setInquiryType] = useState<InquiryType>(
    isInquiryType(typeParam) ? typeParam : "collaboration"
  );

  // Keep the selected tab in sync if the query param changes via client nav.
  useEffect(() => {
    if (isInquiryType(typeParam)) setInquiryType(typeParam);
  }, [typeParam]);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    error: false,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const showToast = (message: string, error = false) => {
    setToast({
      show: true,
      message,
      error,
    });

    setTimeout(() => {
      setToast({
        show: false,
        message: "",
        error: false,
      });
    }, 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setFormState("sending");

    try {
      const { error } = await supabase
        .from("contact_messages")
        .insert([
          {
            name,
            email,
            phone,
            inquiry_type: inquiryType,
            message,
          },
        ]);

      if (error) throw error;

      await supabase.from("activity_logs").insert({
        type: "Customer Enquiry",
        description: `Customer ${name.trim()} made a ${INQUIRY_ACTIVITY_LABELS[inquiryType]} enquiry`,
        metadata: {
          email,
          phone,
          inquiry_type: inquiryType,
        },
      });

      setFormState("sent");

      showToast(
        "Your enquiry has been received. We'll get back to you shortly."
      );

      setTimeout(() => {
        setFormState("idle");
        setName("");
        setEmail("");
        setPhone("");
        setMessage("");
      }, 3000);
    } catch (err: any) {
      setFormState("idle");

      showToast(
        err?.message ??
        "Something went wrong. Please try again.",
        true
      );
    }
  };

  return (
    <>
      <section className="w-full rounded-2xl md:rounded-3xl bg-background border border-border shadow-[0px_8px_30px_rgba(44,56,41,0.06)] p-4">

        {/* Header */}
        <div className="mb-8">

          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6">
            <FiSend size={24} />
          </div>

          <h2 className="cormorant text-3xl md:text-[34px] text-primary-dark mb-6">
            Send a Message
          </h2>

          <div className="flex flex-wrap gap-3">
            {(Object.keys(INQUIRY_LABELS) as InquiryType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setInquiryType(type)}
                className={`rounded-full px-7 py-3 font-jost text-sm font-medium uppercase tracking-[0.14em] transition-all duration-300 ${inquiryType === type
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border bg-transparent text-muted hover:bg-primary/10"
                  }`}
              >
                {INQUIRY_LABELS[type]}
              </button>
            ))}
          </div>

        </div>


        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-10"
        >

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            <Input
              label="Full Name"
              placeholder="John Doe"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Input
              label="Email Address"
              placeholder="john@example.com"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

          </div>

          <Input
            label="Phone Number"
            placeholder="+91 98765 43210"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div>

            <label className="mb-2 ml-1 block font-jost text-sm font-medium text-on-surface-variant">
              Message
            </label>

            <textarea
              rows={5}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={MESSAGE_PLACEHOLDERS[inquiryType]}
              className="w-full rounded-xl border border-outline-variant bg-white px-4 py-3 font-jost text-base outline-none transition-all hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/5 resize-none"
            />

          </div>

          {/* Button */}
          <div>
            <Button
              variant="auth-primary"
              type="submit"
              disabled={formState !== "idle"}
              className="w-full sm:w-auto min-w-[220px] px-10 py-4 gap-2"
            >

              {formState === "idle" && (
                <>
                  Send Message
                </>
              )}

              {formState === "sending" && (
                <>
                  Sending...
                </>
              )}

              {formState === "sent" && (
                <>
                  Message Sent
                </>
              )}

            </Button>
          </div>

        </form>

      </section>

      <Toast
        show={toast.show}
        message={toast.message}
        error={toast.error}
      />
    </>
  );
}