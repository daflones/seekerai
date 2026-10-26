import { describe, expect, it } from "vitest";
import { callingCodeFor, toE164 } from "./phone";

describe("callingCodeFor", () => {
  it("mapeia país ISO pro DDI", () => {
    expect(callingCodeFor("BR")).toBe("55");
    expect(callingCodeFor("US")).toBe("1");
    expect(callingCodeFor("CO")).toBe("57");
    expect(callingCodeFor("br")).toBe("55");
  });
  it("desconhecido/nulo cai no BR", () => {
    expect(callingCodeFor(null)).toBe("55");
    expect(callingCodeFor("XX")).toBe("55");
  });
});

describe("toE164", () => {
  it("BR nacional → prefixa 55", () => {
    expect(toE164("(21) 96805-3672", "55")).toBe("5521968053672");
    expect(toE164("11 3222-1234", "55")).toBe("551132221234");
  });
  it("US nacional → prefixa 1, nunca 55", () => {
    expect(toE164("(555) 123-4567", "1")).toBe("15551234567");
    expect(toE164("555-123-4567", "1")).toBe("15551234567");
  });
  it("já internacional (+ ou 12+ dígitos) não duplica DDI", () => {
    expect(toE164("+1 555 123 4567", "1")).toBe("15551234567");
    expect(toE164("+55 21 96805-3672", "55")).toBe("5521968053672");
    expect(toE164("5521968053672", "55")).toBe("5521968053672");
    expect(toE164("15551234567", "1")).toBe("15551234567");
  });
  it("00 internacional vira E.164", () => {
    expect(toE164("00 1 555 123 4567", "55")).toBe("15551234567");
  });
  it("curto demais / nulo → null", () => {
    expect(toE164("12345", "55")).toBeNull();
    expect(toE164(null, "55")).toBeNull();
  });
});
