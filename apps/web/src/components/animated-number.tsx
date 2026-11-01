"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { useEffect, useState } from "react";

// Número que "rola" de 0 até o valor ao montar — usado nos cards de métrica.
export function AnimatedNumber({ value, format, locales, suffix }: {
  value: number;
  format?: Format;
  locales?: string;
  suffix?: string;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <NumberFlow value={shown} format={format} locales={locales} suffix={suffix} willChange />;
}
