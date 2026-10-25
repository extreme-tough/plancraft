/**
 * Content Security Policy for every page response (ENG-08).
 *
 * Scripts need a per-request nonce; 'strict-dynamic' lets scripts loaded by a nonced script run
 * (Firebase Auth loads the Google sign-in script this way). Styles allow 'unsafe-inline' because
 * server-rendered style attributes from React and Base UI can't carry a nonce; style injection
 * can't execute code, and scripts stay locked down.
 */

/** Firebase endpoints the browser talks to directly (EM-36). */
export const FIREBASE_CONNECT_HOSTS: readonly string[] = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com",
  "https://firebasestorage.googleapis.com",
];

export interface CspOptions {
  nonce: string;
  /** Next.js dev mode needs eval for fast refresh and a websocket for HMR. */
  isDev: boolean;
  /** Firebase Auth domain hosting the sign-in popup iframe, e.g. "plancraft.firebaseapp.com". */
  authDomain?: string | undefined;
}

export function buildCsp({ nonce, isDev, authDomain }: CspOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'", ...FIREBASE_CONNECT_HOSTS];
  if (isDev) connectSrc.push("ws:");

  const frameSrc = authDomain ? [`https://${authDomain}`] : ["'none'"];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://firebasestorage.googleapis.com"],
    "font-src": ["'self'"],
    "connect-src": connectSrc,
    "frame-src": frameSrc,
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

/** Static headers applied to every response, pages and API alike (next.config.ts). */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Not "no-referrer": the Firebase web API key is restricted by HTTP referrer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];
