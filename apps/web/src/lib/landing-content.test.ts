import { describe, expect, it } from "vitest";
import { landingContentSchema, parseLandingContent, videoSource } from "./landing-content";

describe("conteúdo público da landing", () => {
  it("não publica vídeo ou sites por padrão", () => {
    expect(parseLandingContent(null)).toEqual({ video_enabled: false, video_urls: {}, showcase_slugs: [] });
    expect(parseLandingContent({ video_enabled: "true" }).video_enabled).toBe(false);
  });

  it("normaliza players conhecidos sem aceitar HTML ou embeds arbitrários", () => {
    expect(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")).toEqual({
      kind: "embed", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
    expect(videoSource("https://youtu.be/dQw4w9WgXcQ")).toEqual(videoSource("https://youtube.com/embed/dQw4w9WgXcQ"));
    expect(videoSource("https://vimeo.com/12345678")).toEqual({
      kind: "embed", src: "https://player.vimeo.com/video/12345678",
    });
    expect(videoSource("https://media.example.com/demo.mp4")?.kind).toBe("file");
    for (const url of ["javascript:alert(1)", "http://media.example.com/demo.mp4", "https://localhost/demo.mp4", "https://127.0.0.1/demo.mp4", "https://user:pass@example.com/demo.mp4", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ", "https://example.com/embed", "https://youtube.com/"]) {
      expect(videoSource(url)).toBeNull();
    }
  });

  it("valida idiomas, limite e unicidade de sites", () => {
    const value = { video_enabled: true, video_urls: { pt: "https://youtu.be/dQw4w9WgXcQ" }, showcase_slugs: ["site-real"] };
    expect(landingContentSchema.safeParse(value).success).toBe(true);
    expect(landingContentSchema.safeParse({ ...value, video_urls: {} }).success).toBe(false);
    expect(landingContentSchema.safeParse({ ...value, video_urls: { xx: "https://youtu.be/dQw4w9WgXcQ" } }).success).toBe(false);
    for (const showcase_slugs of [["../admin"], ["site-real", "site-real"], Array.from({ length: 9 }, (_, i) => `site-${i}`)]) {
      expect(landingContentSchema.safeParse({ ...value, showcase_slugs }).success).toBe(false);
    }
  });
});
