import { describe, expect, it } from "vitest";
import {
  generateRefreshToken,
  hashToken,
  refreshExpiry,
  signAccessToken,
  verifyAccessToken,
} from "../src/lib/tokens";

describe("JWT access tokens", () => {
  it("signs and verifies a payload round-trip", () => {
    const token = signAccessToken({ sub: "user-1", roleId: "role-1", roleName: "Admin" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.roleId).toBe("role-1");
    expect(payload.roleName).toBe("Admin");
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ sub: "user-1", roleId: "r", roleName: "Admin" });
    expect(() => verifyAccessToken(token.slice(0, -2) + "xx")).toThrow();
  });
});

describe("refresh tokens", () => {
  it("generates unique opaque tokens with matching hashes", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).toHaveLength(64); // sha256 hex
  });

  it("remember-me extends the expiry window", () => {
    const short = refreshExpiry(false).getTime();
    const long = refreshExpiry(true).getTime();
    expect(long).toBeGreaterThan(short);
  });
});
