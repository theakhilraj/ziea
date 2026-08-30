import Link from "next/link";
import { MdOutlineSupportAgent, MdOutlineDraw, MdOutlineTune } from "react-icons/md";
import { buttonBase, buttonVariants } from "@/components/ui/Button";
import { WA_CONSULTATION, WA_INSPIRATION, WA_CUSTOMISE } from "./links";

const CARDS = [
  {
    icon: MdOutlineSupportAgent,
    title: "Designer Consultation",
    perfectFor: "I need expert guidance.",
    body: "Book a consultation, discuss ideas, and receive personalised styling guidance from our expert team.",
    cta: "Book Consultation",
    href: WA_CONSULTATION,
  },
  {
    icon: MdOutlineDraw,
    title: "Create from Inspiration",
    perfectFor: "I saw a dress I love.",
    body: "Share photos or sketches. Our team reviews your ideas and gets in touch with the next steps.",
    cta: "Share Design",
    href: WA_INSPIRATION,
  },
  {
    icon: MdOutlineTune,
    title: "Customise ZIEA Collection",
    perfectFor: "I love a design and want to personalise it.",
    body: "Choose a ZIEA design, customise neckline, sleeves or length, and share your exact measurements.",
    cta: "Start Customising",
    href: WA_CUSTOMISE,
  },
];

export default function ExperienceCards() {
  return (
    <section
      id="experience"
      className="w-full scroll-mt-20 px-page py-12 md:scroll-mt-28 md:py-16"
    >
      <h2 className="mb-8 cormorant text-center text-3xl uppercase tracking-[0.12em] text-primary-dark md:mb-12 md:text-4xl">
        Choose Your Customisation Experience
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {CARDS.map((c) => (
          <div
            key={c.title}
            className="group flex h-full flex-col rounded-2xl border border-border bg-white p-8 transition-colors hover:border-primary/40"
          >
            <div className="mb-6 flex justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <c.icon className="text-3xl" />
              </span>
            </div>
            <h3 className="mb-3 cormorant text-center text-2xl text-primary-dark">
              {c.title}
            </h3>
            <p className="mb-2 text-center font-jost text-xs italic text-muted">
              &ldquo;Perfect for: {c.perfectFor}&rdquo;
            </p>
            <p className="mb-8 flex-grow text-center font-jost text-sm leading-6 text-primary-dark/80">
              {c.body}
            </p>
            <Link
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonBase} ${buttonVariants["auth-primary"]} w-full`}
            >
              {c.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
