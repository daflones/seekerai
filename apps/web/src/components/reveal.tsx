"use client";

import { motion, useReducedMotion } from "framer-motion";

// Entrada suave ao rolar (fade + leve subida). Respeita prefers-reduced-motion.
export function Reveal({ children, delay = 0, className, as = "div" }: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{children}</Tag>;
  return <Tag
    className={className}
    initial={{ opacity: 0, y: 22 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: .6, delay, ease: [0.22, 1, 0.36, 1] }}
  >{children}</Tag>;
}
