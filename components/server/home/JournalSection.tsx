import { Card } from "../../ui/Card";

export default function JournalSection() {
  return (
    <section className="py-20 px-page space-y-8 bg-background">
      <h3 className="cormorant text-3xl text-primary-dark">Journal</h3>
      <div className="space-y-8">
        <Card className="flex flex-col border border-border">
          <div className="h-56 relative">
            <div
              className="bg-cover bg-center w-full h-full"
              title="A beautiful landscape photograph of mist-covered tea plantations in Munnar..."
              style={{
                backgroundImage:
                  "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCiqb7VBn5WHWk-T3nMZdOLSM-og06XnlXJCvazC_N7NjoYYD1cnKYu1srZgxT63urt1riTAnxKKHisTBphpcU4etCXCC8aPPlfySG45axOHltjy-XrZG2a0ZDHua0IILAKz2mN3Pbyp-OuPWNtTTp7Xs1FPxs0wE2oTjxvuGC2T80wgTm0WioyepLCMgH-gBbu1WsFZz3Y5q6lLCrfJyYG2S3p6ajqiTlrTjR985iEzfkRC_Rv-3DOJzCx1aRDPwPH3S-Il4Dsr8k')",
              }}
            />
          </div>
          <div className="p-4 space-y-3 bg-surface">
            <span className="font-label-sm text-secondary uppercase tracking-widest">Rituals — Oct 2023</span>
            <h4 className="cormorant text-2xl text-text">The Art of Slow Living in Kerala</h4>
            <p className="jost text-muted line-clamp-2">
              Discover how the rhythmic waves of the backwaters influence our approach to mindful design and premium nightwear...
            </p>
          </div>
        </Card>

        <Card className="flex flex-col border border-border">
          <div className="h-56 relative">
            <div
              className="bg-cover bg-center w-full h-full"
              title="A close-up artistic shot of a master weaver's hands working on a traditional wooden loom..."
              style={{
                backgroundImage:
                  "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCGcRll7PVTAjpCsq77A_sJzPj029JAJ3nzm4vaw-pajTm70l1TnFVR72wz6hmJqHJ-Dkn5KFwEsqZ_UHqk2GU6W4u9xeFN4HNmSn0OcekLmazK8ScurBVTD0W5MldG7ZI8HMzrW9YWF_OavRj8xLMK_Bn8sdeiSJw9zRfaZzfNc2jhERBOPUCv7hCe1hJIv3UPcB9BnNsCidfyKPOXxEj0GmiZ5kODlvkQlBDnhuvCF4LW3VEFOCc__ai_K8LksRFlag4EVQVxvwI')",
              }}
            />
          </div>
          <div className="p-4 space-y-3 bg-surface">
            <span className="font-label-sm text-secondary uppercase tracking-widest">Heritage - Sept 2023</span>
            <h4 className="cormorant text-2xl text-text">Weaving Generations: The Loom Story</h4>
            <p className="jost text-muted line-clamp-2">
              Our commitment to sustainable fashion begins with the hands that weave our identity. Step inside our traditional workshops...
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}
