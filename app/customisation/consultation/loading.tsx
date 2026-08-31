import PageLoader from "@/components/ui/PageLoader";

// Instant loading UI for the consultation route — shown the moment the user
// navigates, so opening the page never feels like a blank pause while the
// server component resolves the booking window.
export default function Loading() {
  return <PageLoader label="Preparing your consultation…" />;
}
