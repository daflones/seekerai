import { ImageResponse } from "next/og";

export const alt = "SeekerAi — Encontre quem precisa do que você vende";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px",
        background: "linear-gradient(145deg, #0b0814 0%, #17102a 55%, #221239 100%)",
        color: "#efe7fa",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -160,
          right: -120,
          width: 560,
          height: 560,
          borderRadius: "50%",
          border: "1px solid #ab8aff33",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -60,
          right: -20,
          width: 360,
          height: 360,
          borderRadius: "50%",
          border: "1px solid #ab8aff55",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 40,
          right: 80,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "#ab8aff22",
          border: "1px solid #ab8aff88",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#70efdc" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            background: "#ab8aff1f",
            border: "1.5px solid #ab8aff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "3px solid #ab8aff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#70efdc" }} />
          </div>
        </div>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>SeekerAi</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
        <h1 style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.03em", margin: 0 }}>
          Encontre quem precisa do que você vende
          <span style={{ color: "#ab8aff" }}>.</span>
        </h1>
        <p style={{ fontSize: 26, color: "#b3a8c4", lineHeight: 1.45, margin: 0 }}>
          Empresas sem site, WhatsApp verificado e a mensagem de abordagem pronta — tudo em um radar só.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 22,
            color: "#70efdc",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#70efdc" }} />
          Radar de oportunidades ativo
        </div>
        <span style={{ fontSize: 22, color: "#8f7fae" }}>seekerai.digital</span>
      </div>
    </div>,
    size,
  );
}
