// Normalização de telefone para E.164 (formato que a Evolution espera).
// Números internacionais chegam com "+" ou já com o código do país;
// números nacionais recebem o código do país da busca/região.

export const CALLING_CODES: Record<string, string> = {
  BR: "55", PT: "351", US: "1", CA: "1", GB: "44", ES: "34", FR: "33",
  DE: "49", IT: "39", AR: "54", MX: "52", CO: "57", CL: "56", PE: "51",
  UY: "598", PY: "595", BO: "591", EC: "593", VE: "58", NL: "31", BE: "32",
  CH: "41", AT: "43", IE: "353", SE: "46", NO: "47", DK: "45", FI: "358",
  PL: "48", CZ: "420", SK: "421", HU: "36", RO: "40", BG: "359", HR: "385",
  GR: "30", TR: "90", RU: "7", UA: "380", JP: "81", KR: "82", CN: "86",
  HK: "852", TW: "886", SG: "65", IN: "91", ID: "62", TH: "66", VN: "84",
  MY: "60", PH: "63", AU: "61", NZ: "64", ZA: "27", EG: "20", MA: "212",
  AE: "971", SA: "966", IL: "972", AO: "244", MZ: "258", CV: "238",
  GW: "245", ST: "239", TL: "670", PA: "507", CR: "506", DO: "1",
  GT: "502", HN: "504", SV: "503", NI: "505", CU: "53",
};

export function callingCodeFor(isoCountry: string | null | undefined): string {
  return CALLING_CODES[(isoCountry ?? "BR").toUpperCase()] ?? "55";
}

/**
 * Converte telefone para dígitos E.164.
 * - Começando com "+" → já internacional, só limpa.
 * - 12+ dígitos → já inclui código do país.
 * - Menor → número nacional, prefixa o código do país informado.
 */
export function toE164(raw: string | null | undefined, defaultCc = "55"): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  // "00" é prefixo de discagem internacional — o número já é E.164.
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    return digits.length >= 10 && digits.length <= 15 ? digits : null;
  }
  if (digits.length < 7 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return digits;
  // Já com DDI: 12+ dígitos, ou começa com o código do país e o restante
  // tem tamanho de número nacional (ex.: EUA "1" + 10 dígitos = 11).
  const rest = digits.length - defaultCc.length;
  if (digits.length >= 12 || (digits.startsWith(defaultCc) && rest >= 8 && rest <= 11)) return digits;
  return `${defaultCc}${digits}`;
}
