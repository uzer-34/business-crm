"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Animates its direct children in on mount (for above-the-fold content
 * where ScrollTrigger has nothing to trigger on). Skipped under
 * prefers-reduced-motion.
 */
export function StaggerIn({
  children,
  className,
  selector = ":scope > *",
}: {
  children: ReactNode;
  className?: string;
  selector?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const targets = containerRef.current?.querySelectorAll(selector);
        if (!targets || targets.length === 0) return;

        gsap.from(targets, { opacity: 0, y: 10, duration: 0.35, ease: "power2.out", stagger: 0.06 });
      });

      return () => mm.revert();
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
