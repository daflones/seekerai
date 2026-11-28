import { describe, expect, it } from "vitest";
import { getLandingMessages } from "./landing-messages";
import { LANDING_LANGS } from "../landing-content";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) => keys(v, `${prefix}.${key}`));
}
function strings(value: unknown): string[] {
  return typeof value === "string" ? [value] : Object.values(value as object).flatMap(strings);
}

describe("landing em seis idiomas", () => {
  it("mantém todas as chaves, nichos e passos traduzidos", () => {
    const pt = getLandingMessages("pt");
    for (const lang of LANDING_LANGS) {
      const copy = getLandingMessages(lang);
      expect(keys(copy)).toEqual(keys(pt));
      expect(strings(copy).every((s) => s.trim().length > 0)).toBe(true);
      expect(copy.flow.steps).toHaveLength(4);
      expect(copy.sites.niches).toHaveLength(3);
      expect(copy.copilot.examples).toHaveLength(3);
      if (lang !== "pt") {
        expect(copy.heroTitle).not.toBe(pt.heroTitle);
        expect(copy.sites.note).not.toBe(pt.sites.note);
        expect(copy.outreach.note).not.toBe(pt.outreach.note);
        expect(copy.copilot.note).not.toBe(pt.copilot.note);
      }
    }
  });
});
