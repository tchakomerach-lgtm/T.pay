import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { PostgresDurableSecurityStore } from "../packages/finance/src/postgres-security.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("durable replay barrier serializes concurrent claims", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const clients = await Promise.all(Array.from({length:8}, () => new pg.Client({connectionString:databaseUrl})));
  const tenantId = "org-" + randomUUID();
  const jti = "jti-" + randomUUID();
  const digest = "a".repeat(64);
  try {
    await Promise.all(clients.map(c=>c.connect()));
    await applyMigrations(clients[0]!, pathToFileURL(join(process.cwd(),"migrations") + "/"));
    const results = await Promise.all(clients.map(c => new PostgresDurableSecurityStore(c).claimReplay({
      tenantId,jti,requestDigest:digest,expiresAt:"2030-01-01T00:00:00.000Z",source:"system"
    })));
    assert.equal(results.filter(r=>r==="CLAIMED").length,1);
    assert.equal(results.filter(r=>r==="REPLAY").length,7);
  } finally {
    await clients[0]?.query("DELETE FROM security_replay_claims WHERE tenant_id=$1",[tenantId]).catch(()=>undefined);
    await Promise.all(clients.map(c=>c.end().catch(()=>undefined)));
  }
});

test("approval consumption is one-time under concurrent requests", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const clients = await Promise.all(Array.from({length:8}, () => new pg.Client({connectionString:databaseUrl})));
  const tenantId = "org-" + randomUUID();
  const approvalId = "approval-" + randomUUID();
  const digest = "b".repeat(64);
  try {
    await Promise.all(clients.map(c=>c.connect()));
    await applyMigrations(clients[0]!, pathToFileURL(join(process.cwd(),"migrations") + "/"));
    await new PostgresDurableSecurityStore(clients[0]!).createApproval({
      approvalId,tenantId,approverId:"admin-1",requestDigest:digest,expiresAt:"2030-01-01T00:00:00.000Z"
    });
    const results = await Promise.all(clients.map(c => new PostgresDurableSecurityStore(c).consumeApproval({
      approvalId,tenantId,requestDigest:digest,now:"2029-01-01T00:00:00.000Z"
    })));
    assert.equal(results.filter(r=>r==="CONSUMED").length,1);
    assert.equal(results.filter(r=>r==="ALREADY_CONSUMED").length,7);
  } finally {
    await clients[0]?.query("DELETE FROM security_approvals WHERE approval_id=$1",[approvalId]).catch(()=>undefined);
    await Promise.all(clients.map(c=>c.end().catch(()=>undefined)));
  }
});
