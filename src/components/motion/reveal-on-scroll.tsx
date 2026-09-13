"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Fades/slides in its direct children as they scroll into view. Kept subtle
 * on purpose (brief §35-36: restrained, not decorative) and fully skipped
 * under prefers-reduced-motion.
 */
export function RevealOnScroll({
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

        gsap.set(targets, { opacity: 0, y: 12 });

        ScrollTrigger.batch(targets, {
          start: "top 90%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.06 }),
        });
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
