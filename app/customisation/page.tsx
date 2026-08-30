import { Metadata } from "next";

import Header from "@/components/client/layout/Header";
import Footer from "@/components/server/layout/Footer";
import StudioHero from "@/components/server/customisation/StudioHero";
import ExperienceCards from "@/components/server/customisation/ExperienceCards";
import ProcessTimeline from "@/components/server/customisation/ProcessTimeline";

export const metadata: Metadata = {
  title: "Customisation Studio",
  description:
    "Create something uniquely yours with ZIEA - designer consultations, made-to-measure fits, and personalised designs crafted to your style and occasion.",
  alternates: { canonical: "/customisation" },
};

export default function CustomisationStudioPage() {
  return (
    <>
      <Header />

      <main className="bg-background mt-16 md:mt-24">
        <StudioHero />
        <ExperienceCards />
        <ProcessTimeline />
      </main>

      <Footer />
    </>
  );
}
