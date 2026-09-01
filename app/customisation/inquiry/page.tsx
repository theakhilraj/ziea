import { Metadata } from "next";
import Link from "next/link";

import Header from "@/components/client/layout/Header";
import Footer from "@/components/server/layout/Footer";
import DesignInquiryForm from "@/components/client/customisation/DesignInquiryForm";
import { getDeliveryWindow } from "@/utils/inquiry.server";

export const metadata: Metadata = {
  title: "Design Inquiry",
  description:
    "Share your inspiration with ZIEA and our artisans will craft a bespoke piece tailored to your exact specifications.",
  alternates: { canonical: "/customisation/inquiry" },
};

// The delivery window (IST today / min / max / disabled days) is time-sensitive:
// computed per request, never prerendered at build (which would freeze it at the
// build date).
export const dynamic = "force-dynamic";

export default async function InquiryPage() {
  const { todayISO, minISO, maxISO, disabledDates } = await getDeliveryWindow();

  return (
    <>
      <Header />

      <main className="bg-background mt-16 md:mt-24">
        <div className="w-full px-page pt-4 md:pt-6 pb-12 md:pb-16">
          {/* Breadcrumb */}
          <nav className="flex items-center text-[13px] md:text-sm text-muted mb-6 md:mb-8">
            <Link href="/" className="transition-colors hover:text-primary">
              Home
            </Link>
            <span className="mx-2 text-muted/40">/</span>
            <Link
              href="/customisation"
              className="transition-colors hover:text-primary"
            >
              Customisation
            </Link>
            <span className="mx-2 text-muted/40">/</span>
            <span className="text-text">Design Inquiry</span>
          </nav>

          {/* Heading */}
          <div className="mx-auto mb-8 md:mb-12 max-w-3xl text-center">
            <h1 className="cormorant text-5xl md:text-6xl text-primary-dark">
              Design Inquiry
            </h1>
            <p className="mt-5 font-jost text-base md:text-lg leading-8 text-muted">
              Bring your unique vision to life. Share your inspiration and our
              artisans will craft a bespoke piece tailored to your exact
              specifications.
            </p>
          </div>

          <div className="mx-auto max-w-4xl">
            <DesignInquiryForm
              todayISO={todayISO}
              minISO={minISO}
              maxISO={maxISO}
              disabledDates={disabledDates}
            />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
