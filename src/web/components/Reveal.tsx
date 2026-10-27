import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * Fades and lifts its children into place the first time they scroll into
 * view. The content is in the DOM and readable from the start (the hidden
 * state is only opacity and a 12px offset in marketing.css, and reduced
 * motion never hides it); only the reveal needs JavaScript, so a prerendered
 * page that never hydrates still shows everything once the observer is
 * missing, because the class is only added by it.
 */
export function Reveal({
  as: Tag = "div",
  className,
  delay = 0,
  children,
}: {
  as?: ElementType;
  className?: string;
  /** Milliseconds after entering view, for a cascade. */
  delay?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("m-reveal");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={className} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
