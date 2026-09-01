"use client";

import { useCallback, type MouseEvent, type ReactNode } from "react";

interface ScrollToButtonProps {
  /** id of the in-page element to scroll to (without the leading '#'). */
  targetId: string;
  className?: string;
  children: ReactNode;
  /** Total scroll animation time in ms — lower is snappier. Default 450. */
  duration?: number;
}

/** easeInOutCubic — quick to accelerate, gentle to settle. */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Anchor that smooth-scrolls to an in-page target over a CONTROLLED duration.
 * The native CSS `scroll-behavior: smooth` scales its speed with distance, so a
 * viewport-plus jump (hero → experience section) feels sluggish. This runs a
 * fixed-duration requestAnimationFrame animation instead, honouring the target's
 * `scroll-margin-top` (sticky-header offset) and `prefers-reduced-motion`.
 */
export default function ScrollToButton({
  targetId,
  className,
  children,
  duration = 450,
}: ScrollToButtonProps) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      const el = document.getElementById(targetId);
      if (!el) return; // target not mounted → let the browser handle the hash
      e.preventDefault();

      const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const targetY = el.getBoundingClientRect().top + window.scrollY - offset;

      // Reflect the hash in the URL without triggering a native jump.
      history.replaceState(null, "", `#${targetId}`);

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduceMotion) {
        window.scrollTo(0, targetY);
        return;
      }

      const startY = window.scrollY;
      const distance = targetY - startY;
      if (distance === 0) return;

      // Temporarily disable the global CSS smooth-scroll so each frame positions
      // instantly — otherwise the CSS animation and this rAF loop fight each other.
      const root = document.documentElement;
      const prevBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";

      let start: number | null = null;
      const step = (now: number) => {
        if (start === null) start = now;
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, startY + distance * easeInOutCubic(t));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          root.style.scrollBehavior = prevBehavior;
        }
      };
      requestAnimationFrame(step);
    },
    [targetId, duration],
  );

  return (
    <a href={`#${targetId}`} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
