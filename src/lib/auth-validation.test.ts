import { describe, expect, it } from "vitest";
import { authFields, validateAuthField, validateAuthForm } from "./auth-validation";

describe("auth input validation", () => {
  it("checks email format and accepts trimmed email", () => {
    expect(authFields.email.parse(" team@example.com ")).toBe("team@example.com");
    for (const value of ["", "not-an-email", "নাম@example.com", "a b@example.com", `${"a".repeat(255)}@example.com`]) {
      expect(validateAuthField("email", value)).toBeDefined();
    }
  });
  it("preserves password characters, whitespace and Unicode", () => {
    expect(validateAuthField("password", "short")).toBeDefined();
    expect(authFields.password.parse(" বাংলা password ")).toBe(" বাংলা password ");
  });
  it("only requires name in the existing signup mode", () => {
    const values = { email: "team@example.com", password: "secret123", fullName: "" };
    expect(validateAuthForm(values, false)).toEqual({});
    expect(validateAuthForm(values, true)).toHaveProperty("fullName");
    expect(validateAuthField("fullName", "নাবিল")).toBeUndefined();
    expect(validateAuthField("fullName", "a".repeat(101))).toBeDefined();
  });
});