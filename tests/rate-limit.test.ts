/**
 * Rate limiter tests.
 *
 * The limiter guards real money, so the behaviour worth pinning is that it
 * actually stops the (N+1)th call, forgets old hits, and keeps callers apart.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  callerKey,
  rateLimit,
  resetRateLimits,
  tooManyRequests,
} from "../lib/rate-limit.ts";

beforeEach(() => resetRateLimits());

describe("rateLimit", () => {
  it("allows exactly the limit, then refuses", () => {
    for (let i = 0; i < 5; i++) {
      assert.equal(rateLimit("a", 5, 60_000).ok, true, `call ${i + 1} should pass`);
    }
    assert.equal(rateLimit("a", 5, 60_000).ok, false, "the 6th must be refused");
  });

  it("counts down the remaining allowance", () => {
    assert.equal(rateLimit("a", 3, 60_000).remaining, 2);
    assert.equal(rateLimit("a", 3, 60_000).remaining, 1);
    assert.equal(rateLimit("a", 3, 60_000).remaining, 0);
  });

  it("keeps separate callers separate", () => {
    for (let i = 0; i < 3; i++) rateLimit("alice", 3, 60_000);
    assert.equal(rateLimit("alice", 3, 60_000).ok, false);
    assert.equal(rateLimit("bob", 3, 60_000).ok, true, "bob must not pay for alice");
  });

  it("keeps separate buckets separate for one caller", () => {
    for (let i = 0; i < 3; i++) rateLimit("plan:1.2.3.4", 3, 60_000);
    assert.equal(rateLimit("plan:1.2.3.4", 3, 60_000).ok, false);
    assert.equal(rateLimit("interview:1.2.3.4", 3, 60_000).ok, true);
  });

  it("forgets hits once the window has passed", async () => {
    assert.equal(rateLimit("a", 1, 40).ok, true);
    assert.equal(rateLimit("a", 1, 40).ok, false);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(rateLimit("a", 1, 40).ok, true, "the window should have slid");
  });

  it("reports a retry-after inside the window", () => {
    rateLimit("a", 1, 60_000);
    const blocked = rateLimit("a", 1, 60_000);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60);
  });
});

describe("callerKey", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.com", { headers });

  it("prefers the first x-forwarded-for hop", () => {
    assert.equal(
      callerKey(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "plan"),
      "plan:1.2.3.4",
    );
  });

  it("falls back through the other proxy headers", () => {
    assert.equal(callerKey(req({ "cf-connecting-ip": "9.9.9.9" }), "plan"), "plan:9.9.9.9");
    assert.equal(callerKey(req({ "x-real-ip": "8.8.8.8" }), "plan"), "plan:8.8.8.8");
  });

  it("degrades to a shared bucket rather than throwing", () => {
    assert.equal(callerKey(req({}), "plan"), "plan:unknown");
  });

  it("namespaces by bucket so routes cannot drain each other", () => {
    const headers = { "x-forwarded-for": "1.2.3.4" };
    assert.notEqual(callerKey(req(headers), "plan"), callerKey(req(headers), "interview"));
  });
});

describe("tooManyRequests", () => {
  it("returns a 429 carrying a Retry-After header", async () => {
    const res = tooManyRequests(42);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "42");
    assert.equal((await res.json()).retryAfter, 42);
  });
});
