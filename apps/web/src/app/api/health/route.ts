export function GET() {
  return Response.json({ status: "ok", service: "seekerai-web" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
