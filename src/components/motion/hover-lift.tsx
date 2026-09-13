"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Subtle hover lift (translateY + shadow) for cards. No-ops under
 * prefers-reduced-motion or on touch (no real hover there).
 */
export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const el = ref.current;
      if (!el || !contextSafe) return;

      const canHover = window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;
      if (!canHover) return;

      const onEnter = contextSafe(() => {
        gsap.to(el, { y: -3, boxShadow: "0 8px 20px -8px rgb(0 0 0 / 0.18)", duration: 0.2, ease: "power2.out" });
      });
      const onLeave = contextSafe(() => {
        gsap.to(el, { y: 0, boxShadow: "0 0px 0px 0 rgb(0 0 0 / 0)", duration: 0.25, ease: "power2.out" });
      });

      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);

      return () => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      };
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
