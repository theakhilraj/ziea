import {
  MdOutlineLightbulb,
  MdOutlineForum,
  MdOutlineStraighten,
  MdOutlineContentCut,
  MdOutlineFactCheck,
  MdOutlineLocalMall,
} from "react-icons/md";

const STEPS = [
  { n: "01", icon: MdOutlineLightbulb, label: "Share Your Idea" },
  { n: "02", icon: MdOutlineForum, label: "Design & Discuss" },
  { n: "03", icon: MdOutlineStraighten, label: "Measurements" },
  { n: "04", icon: MdOutlineContentCut, label: "Crafting" },
  { n: "05", icon: MdOutlineFactCheck, label: "Quality Check" },
  { n: "06", icon: MdOutlineLocalMall, label: "Delivered" },
];

export default function ProcessTimeline() {
  return (
    <section className="w-full bg-background">
      <div className="w-full px-page py-12 md:py-16">
        <h2 className="mb-8 cormorant text-center text-3xl uppercase tracking-[0.12em] text-primary-dark md:mb-12 md:text-4xl">
          Our Customisation Process
        </h2>
        <div className="relative">
          {/* Connecting line — horizontal on desktop only (mobile is a centered stack) */}
          <div
            className="absolute left-0 top-8 hidden h-px w-full bg-border md:block"
            aria-hidden="true"
          />
          <ol className="relative z-10 flex flex-col items-center gap-10 md:grid md:grid-cols-6 md:items-start md:gap-x-6 md:gap-y-10">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col items-center text-center">
                <div className="mb-5 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#2C3829] text-white shadow-sm">
                  <s.icon className="text-2xl" />
                </div>
                <span className="font-jost text-2xl text-primary">{s.n}</span>
                <span className="mt-1 font-jost text-xs uppercase tracking-[0.12em] text-primary-dark">
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
