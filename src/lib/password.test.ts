import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the correct password without storing it in plaintext", async () => {
    const encoded = await hashPassword("test-password-with-sufficient-length");
    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain("test-password-with-sufficient-length");
    await expect(verifyPassword("test-password-with-sufficient-length", encoded)).resolves.toBe(true);
    await expect(verifyPassword("different-password", encoded)).resolves.toBe(false);
  });

  it("rejects malformed or unsupported hashes", async () => {
    await expect(verifyPassword("irrelevant", "invalid")).resolves.toBe(false);
    await expect(verifyPassword("irrelevant", "bcrypt$salt$key")).resolves.toBe(false);
    await expect(verifyPassword("irrelevant", "scrypt$AA$AA")).resolves.toBe(false);
  });
});
