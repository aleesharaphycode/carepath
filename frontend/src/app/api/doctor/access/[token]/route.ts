import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const resolvedParams = await params;
  const token = resolvedParams?.token;

  if (!token) {
    return NextResponse.json(
      { detail: "Doctor access token is required." },
      { status: 400 }
    );
  }

  const backendUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:8000";

  // Forward client's real IP for access audit logging
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "";

  try {
    const backendRes = await fetch(
      `${backendUrl}/api/doctor/access/${encodeURIComponent(token.trim())}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
        },
        cache: "no-store",
      }
    );

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (error) {
    console.error("Doctor access proxy error:", error);
    return NextResponse.json(
      { detail: "Unable to reach CarePath validation service. Please try again later." },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const resolvedParams = await params;
  const token = resolvedParams?.token;

  if (!token) {
    return NextResponse.json(
      { detail: "Doctor access token is required." },
      { status: 400 }
    );
  }

  const backendUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:8000";

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "";

  try {
    const body = await request.json();
    const backendRes = await fetch(
      `${backendUrl}/api/doctor/access/${encodeURIComponent(token.trim())}/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (error) {
    console.error("Doctor access verify proxy error:", error);
    return NextResponse.json(
      { detail: "Unable to reach CarePath validation service." },
      { status: 502 }
    );
  }
}
