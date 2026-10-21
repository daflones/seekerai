import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/admin", "/api", "/auth", "/completar-cadastro", "/redefinir-senha", "/recuperar-senha"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
