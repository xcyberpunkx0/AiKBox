import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

// People who turn on "reduce motion" in their OS settings get no animations at all
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Attach the returned ref to an element and it animates in from `vars` when it mounts
export function useEnter(vars) {
  const ref = useRef(null);
  useGSAP(() => {
    if (reducedMotion || !ref.current) return;
    gsap.from(ref.current, { opacity: 0, y: 10, duration: 0.35, ease: "power3.out", ...vars });
  });
  return ref;
}
