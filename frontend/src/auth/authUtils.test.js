import { describe, expect, it } from "vitest";
import { authErrorMessage, checkPassword, isValidEmail, safeRedirectPath } from "./authUtils";

describe("safeRedirectPath", () => {
  it("allows in-app paths", () => {
    expect(safeRedirectPath("/cost")).toBe("/cost");
    expect(safeRedirectPath("/alerts-security?x=1")).toBe("/alerts-security?x=1");
  });
  it("blocks open redirects and auth loops", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/login", "/login?next=x", undefined, 42]) {
      expect(safeRedirectPath(bad)).toBe("/");
    }
  });
});

describe("checkPassword", () => {
  it("accepts a strong password", () => {
    const r = checkPassword("Blue-Horizon-2049!", { email: "jo@acme.com", name: "Jo Smith" });
    expect(r.valid).toBe(true);
    expect(r.score).toBe(4);
  });
  it("rejects short, common, personal and repetitive passwords", () => {
    expect(checkPassword("Ab1!").valid).toBe(false);
    expect(checkPassword("Password1234!").valid).toBe(false);
    expect(checkPassword("Surbhi#Secure99", { name: "Surbhi V" }).valid).toBe(false);
    expect(checkPassword("jdoe#Secure9999", { email: "jdoe@acme.com" }).valid).toBe(false);
    expect(checkPassword("Aaaaa1!xyzqwe").valid).toBe(false);
  });
  it("rejects passwords over the max length", () => {
    expect(checkPassword(`Aa1!${"x".repeat(200)}`).valid).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("validates addresses", () => {
    expect(isValidEmail(" User@Acme.com ")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("handles network, rate-limit and server errors", () => {
    expect(authErrorMessage({})).toMatch(/reach the server/);
    expect(authErrorMessage({ response: { status: 429, headers: { "retry-after": "120" } } })).toMatch(/2 minutes/);
    expect(authErrorMessage({ response: { status: 500, data: { detail: "Traceback..." } } })).toMatch(/server had a problem/);
  });
});
