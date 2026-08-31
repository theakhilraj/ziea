import { Metadata } from "next";
import Link from "next/link";

import Header from "@/components/client/layout/Header";
import Footer from "@/components/server/layout/Footer";
import ConsultationForm from "@/components/client/customisation/ConsultationForm";
import { getBookingWindow } from "@/utils/consultation";

export const metadata: Metadata = {
  title: "Designer Consultation",
  description:
    "Schedule a private designer consultation with ZIEA to discuss your vision and begin the bespoke process.",
  alternates: { canonical: "/customisation/consultation" },
};

// The booking window (IST today / max / days-off) is time-sensitive: computed per
// request, never prerendered at build (which would freeze it at the build date).
export const dynamic = "force-dynamic";

export default async function ConsultationPage() {
  const { todayISO, maxISO, daysOff } = await getBookingWindow();

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
            <span className="text-text">Consultation</span>
          </nav>

          {/* Heading */}
          <div className="mx-auto mb-8 md:mb-12 max-w-3xl text-center">
            <h1 className="cormorant text-5xl md:text-6xl text-primary-dark">
              Designer Consultation
            </h1>
            <p className="mt-5 font-jost text-base md:text-lg leading-8 text-muted">
              Schedule a private session to discuss your vision and begin the
              bespoke process.
            </p>
          </div>

          <div className="mx-auto max-w-4xl">
            <ConsultationForm
              todayISO={todayISO}
              maxISO={maxISO}
              daysOff={daysOff}
            />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
