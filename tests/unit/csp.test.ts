import { describe, expect, it } from "vitest";
import { buildCsp, FIREBASE_CONNECT_HOSTS, STATIC_SECURITY_HEADERS } from "@/server/security/csp";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("buildCsp (ENG-08)", () => {
  const prod = directives(buildCsp({ nonce: "abc123", isDev: false, authDomain: "plancraft.firebaseapp.com" }));

  it("allows scripts only with the request nonce, never inline or eval", () => {
    const scripts = prod.get("script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("locks down framing, plugins and base URI", () => {
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'none'"]);
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
  });

  it("connects only to itself and the Firebase endpoints (EM-36)", () => {
    expect(prod.get("connect-src")).toEqual(["'self'", ...FIREBASE_CONNECT_HOSTS]);
  });

  it("frames only the Firebase auth domain, or nothing when it isn't configured", () => {
    expect(prod.get("frame-src")).toEqual(["https://plancraft.firebaseapp.com"]);
    const noAuth = directives(buildCsp({ nonce: "n", isDev: false }));
    expect(noAuth.get("frame-src")).toEqual(["'none'"]);
  });

  it("adds eval and the HMR websocket only in development", () => {
    const dev = directives(buildCsp({ nonce: "n", isDev: true }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("static security headers", () => {
  const byName = new Map(STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]));

  it("sets the headers required by ENG-08", () => {
    expect(byName.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byName.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(byName.get("Permissions-Policy")).toContain("camera=()");
  });

  it("keeps the referrer on same-origin-safe terms so the Firebase key restriction works", () => {
    expect(byName.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
