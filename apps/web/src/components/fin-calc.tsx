"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

// Calculadora rápida do financeiro — visível entre o saldo e o
// histórico de saques. Execução imediata estilo calculadora comum:
// guarda acumulador + operador, % = /100 do valor atual.
type Op = "+" | "-" | "×" | "÷";

const apply = (a: number, o: Op, b: number) =>
  o === "+" ? a + b : o === "-" ? a - b : o === "×" ? a * b : b === 0 ? NaN : a / b;

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "Erro";
  // Arredonda lixo de ponto flutuante e formata pt-BR com vírgula.
  const r = Math.round(n * 1e10) / 1e10;
  return r.toLocaleString("pt-BR", { maximumFractionDigits: 8 });
};

export function FinCalc() {
  const [disp, setDisp] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);

  const cur = () => Number(disp.replace(",", ".")) || 0;

  function digit(d: string) {
    if (disp === "Erro") { setDisp(d === "," ? "0," : d); setAcc(null); setOp(null); setFresh(false); return; }
    if (fresh) { setDisp(d === "," ? "0," : d); setFresh(false); return; }
    if (d === "," && disp.includes(",")) return;
    if (disp.replace(/[-,]/g, "").length >= 12) return;
    setDisp((v) => (v === "0" && d !== "," ? d : v === "-0" && d !== "," ? `-${d}` : v + d));
  }

  function setOperator(o: Op) {
    if (op && !fresh && acc !== null) {
      const r = apply(acc, op, cur());
      setDisp(fmt(r)); setAcc(r);
    } else {
      setAcc(cur());
    }
    setOp(o); setFresh(true);
  }

  function equals() {
    if (op === null || acc === null) return;
    setDisp(fmt(apply(acc, op, cur())));
    setAcc(null); setOp(null); setFresh(true);
  }

  function percent() { setDisp(fmt(cur() / 100)); setFresh(true); }
  function negate() { setDisp((v) => (v.startsWith("-") ? v.slice(1) : `-${v}`)); }
  function back() { setDisp((v) => (v.length <= 1 || (v.length === 2 && v.startsWith("-")) ? "0" : v.slice(0, -1))); }
  function clear() { setDisp("0"); setAcc(null); setOp(null); setFresh(true); }

  const key = (label: string, onClick: () => void, cls = "") => (
    <button key={label} type="button" className={`fin-calc-key${cls}`} onClick={onClick}>{label}</button>
  );

  return (
    <section className="dash-panel fin-calc">
      <h2><Calculator size={16} /> Calculadora</h2>
      <div className="fin-calc-disp" aria-live="polite">
        {op !== null && acc !== null && <small>{fmt(acc)} {op}</small>}
        <strong>{disp}</strong>
      </div>
      <div className="fin-calc-keys">
        {key("C", clear, " is-fn")}
        {key("⌫", back, " is-fn")}
        {key("%", percent, " is-fn")}
        {key("÷", () => setOperator("÷"), " is-op")}
        {key("7", () => digit("7"))}{key("8", () => digit("8"))}{key("9", () => digit("9"))}
        {key("×", () => setOperator("×"), " is-op")}
        {key("4", () => digit("4"))}{key("5", () => digit("5"))}{key("6", () => digit("6"))}
        {key("-", () => setOperator("-"), " is-op")}
        {key("1", () => digit("1"))}{key("2", () => digit("2"))}{key("3", () => digit("3"))}
        {key("+", () => setOperator("+"), " is-op")}
        {key("±", negate, " is-fn")}{key("0", () => digit("0"))}{key(",", () => digit(","))}
        {key("=", equals, " is-eq")}
      </div>
    </section>
  );
}
