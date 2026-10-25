import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/server/security/csp";

/** Issues a fresh CSP nonce per page request; Next.js applies it to its own scripts. */
export function middleware(request: NextRequest): NextResponse {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
