// Client-side auth helpers. These improve UX and block obviously weak input,
// but the backend must enforce the same rules — never rely on them alone.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;
export const NAME_MAX_LENGTH = 150;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Small deny-list of the most-breached passwords / patterns (compared lowercase,
// with digits and symbols stripped so "Password123!" is caught too).
const COMMON_WORDS = [
  "password", "passw0rd", "qwerty", "letmein", "welcome", "admin", "iloveyou",
  "monkey", "dragon", "football", "baseball", "abc", "abcdef", "changeme",
  "secret", "login", "master", "sunshine", "princess", "trustno",
];

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  const e = normalizeEmail(email);
  return e.length > 0 && e.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(e);
}

/**
 * Evaluate a password against the policy.
 * @returns {{ rules: {key,label,ok}[], valid: boolean, score: number }}
 */
export function checkPassword(password, { email = "", name = "" } = {}) {
  const pw = String(password || "");
  const lower = pw.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, "");
  const emailLocal = normalizeEmail(email).split("@")[0];
  const nameParts = String(name || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 3);

  const containsPersonal =
    (emailLocal.length >= 3 && lower.includes(emailLocal)) ||
    nameParts.some((p) => lower.includes(p));
  const isCommon = COMMON_WORDS.some((w) => letters === w || (w.length >= 6 && letters.includes(w)));
  const repetitive = /(.)\1{3,}/.test(pw);

  const rules = [
    { key: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: pw.length >= PASSWORD_MIN_LENGTH && pw.length <= PASSWORD_MAX_LENGTH },
    { key: "lower", label: "One lowercase letter", ok: /[a-z]/.test(pw) },
    { key: "upper", label: "One uppercase letter", ok: /[A-Z]/.test(pw) },
    { key: "digit", label: "One number", ok: /\d/.test(pw) },
    { key: "symbol", label: "One symbol (e.g. ! @ # $)", ok: /[^A-Za-z0-9\s]/.test(pw) },
    { key: "personal", label: "Doesn't contain your name or email", ok: pw.length > 0 && !containsPersonal },
    { key: "common", label: "Not a common or repetitive password", ok: pw.length > 0 && !isCommon && !repetitive },
  ];

  const passed = rules.filter((r) => r.ok).length;
  const valid = passed === rules.length;
  // 0–4 strength meter; long valid passwords get full marks.
  let score = Math.floor((passed / rules.length) * 3);
  if (valid) score = pw.length >= 16 ? 4 : 3;

  return { rules, valid, score };
}

export const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];

/**
 * Only allow redirects to in-app paths — blocks open redirects such as
 * "//evil.com", "https://evil.com", "/\\evil.com" or "javascript:" URLs.
 */
export function safeRedirectPath(path, fallback = "/") {
  if (typeof path !== "string" || !path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\") || /[\u0000-\u001f]/.test(path)) return fallback;
  if (["/login", "/register", "/forgot-password", "/reset-password"].some((p) => path.startsWith(p))) {
    return fallback;
  }
  return path;
}

/** Map an axios error to a safe, user-facing message (never echo raw server internals). */
export function authErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error?.response) {
    return "Can't reach the server. Check your connection and try again.";
  }
  const { status, headers, data } = error.response;
  if (status === 429) {
    const retry = parseInt(headers?.["retry-after"], 10);
    if (retry > 0) {
      const mins = Math.ceil(retry / 60);
      return `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
    }
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (status >= 500) return "The server had a problem. Please try again shortly.";
  const detail = data?.detail;
  if (typeof detail === "string" && detail.length < 200) return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg;
  return fallback;
}
