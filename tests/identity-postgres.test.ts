import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, generateOpaqueToken, buildSessionCookie, assertCsrf, sha256Hex } from "../packages/identity/src/index.js";

test("password hashing is salted and verifiable", async () => {
  const a = await hashPassword("correct horse battery staple 123");
  const b = await hashPassword("correct horse battery staple 123");
  assert.notEqual(a,b);
  assert.equal(await verifyPassword("correct horse battery staple 123",a),true);
  assert.equal(await verifyPassword("wrong password",a),false);
});

test("session tokens are opaque and high entropy", () => {
  const a = generateOpaqueToken(32);
  const b = generateOpaqueToken(32);
  assert.notEqual(a,b);
  assert.ok(a.length >= 40);
});

test("session cookie is hardened", () => {
  const cookie = buildSessionCookie("x".repeat(43),3600);
  assert.match(cookie,/__Host-tpay_session=/);
  assert.match(cookie,/Secure/);
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/SameSite=Strict/);
  assert.match(cookie,/Path=\//);
  assert.doesNotMatch(cookie,/Domain=/);
});

test("CSRF requires same origin and matching token", () => {
  const token = "a".repeat(40);
  assert.doesNotThrow(() => assertCsrf("https://app.tpay.test","https://app.tpay.test",token,sha256Hex(token)));
  assert.throws(() => assertCsrf("https://evil.example","https://app.tpay.test",token,sha256Hex(token)),/CSRF_ORIGIN_REJECTED/);
  assert.throws(() => assertCsrf("https://app.tpay.test","https://app.tpay.test","b".repeat(40),sha256Hex(token)),/CSRF_TOKEN_REJECTED/);
});
