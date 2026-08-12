import { NextRequest, NextResponse } from "next/server";

const API_URL = (
  process.env.AGENCY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api"
).replace(/\/$/, "");

const TOKEN = process.env.API_TOKEN || process.env.AGENCY_API_TOKEN || "";

const FORWARD_HEADERS = ["content-type", "accept"];

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

async function proxyHandler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = `${API_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  for (const name of FORWARD_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  if (TOKEN) headers["authorization"] = `Bearer ${TOKEN}`;

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      {
        detail: `Cannot reach the agency API at ${API_URL}. Is the backend running?`,
      },
      { status: 502 },
    );
  }

  if (res.status === 204 || res.status === 205) {
    return new NextResponse(null, {
      status: res.status,
      headers: SECURITY_HEADERS,
    });
  }

  const resBody = await res.arrayBuffer();
  return new NextResponse(resBody, {
    status: res.status,
    headers: {
      ...SECURITY_HEADERS,
      "content-type":
        res.headers.get("content-type") || "application/json",
    },
  });
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;
export const PUT = proxyHandler;
