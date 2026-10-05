import test from "node:test";
import assert from "node:assert/strict";
import { PostgresVoiceProviderReplayStore } from "../packages/ai/src/voice-provider-replay.js";
import { assertVoiceRouteTransport, VOICE_ROUTES } from "../packages/api-gateway/src/voice-routes.js";

test("provider callback replay is tenant-scoped and payload-bound", async () => {
  const rows = new Map<string,string>();
  const db = {
    async query<Row extends Record<string,unknown>>(sql:string, values?:readonly unknown[]) {
      if (sql.startsWith("INSERT")) {
        const key = String(values?.slice(0,3).join(":"));
        if (rows.has(key)) return { rows: [], rowCount: 0 };
        rows.set(key, String(values?.[3]));
        return { rows: [], rowCount: 1 };
      }
      const key = String(values?.slice(0,3).join(":"));
      const hash = rows.get(key);
      return { rows: hash ? [{payload_sha256:hash} as Row] : [], rowCount: hash ? 1 : 0 };
    },
  };
  const store = new PostgresVoiceProviderReplayStore(db);
  assert.equal(await store.claim("org-a","provider-a","evt-1","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","2026-10-05T14:00:00Z"), true);
  assert.equal(await store.claim("org-a","provider-a","evt-1","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","2026-10-05T14:00:01Z"), false);
  await assert.rejects(
    store.claim("org-a","provider-a","evt-1","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","2026-10-05T14:00:02Z"),
    /PAYLOAD_CONFLICT/,
  );
  assert.equal(await store.claim("org-b","provider-a","evt-1","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","2026-10-05T14:00:02Z"), true);
});

test("all mutating voice routes require idempotency and TLS 1.3 transport contract", () => {
  for (const route of VOICE_ROUTES) assert.doesNotThrow(() => assertVoiceRouteTransport(route));
});
