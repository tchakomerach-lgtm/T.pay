import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";

function fixture() {
  const groups = new Map<string, Record<string, unknown>>();
  const idempotency = new Map<string, Record<string, unknown>>();
  let protectionPolicy: Record<string,unknown>|null=null;
  const protectionEvidence: Array<Record<string,unknown>>=[];
  const sqlCalls: Array<{ sql: string; values?: unknown[] }> = [];
  const db = {
    async query(sql: string, values?: unknown[]) {
      sqlCalls.push({ sql, ...(values === undefined ? {} : { values }) });
      if (sql.startsWith("INSERT INTO api_request_deduplication")) {
        const key = String(values?.[2]);
        if (idempotency.has(key)) return { rows: [], rowCount: 0 };
        const row = { id: values?.[0], request_hash: values?.[3], route: values?.[4], state: "reserved", status_code: null };
        idempotency.set(key, row);
        return { rows: [{ id: values?.[0] }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id,request_hash,route,state,response_hash,status_code FROM api_request_deduplication")) {
        const row = idempotency.get(String(values?.[1]));
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.startsWith("UPDATE api_request_deduplication")) {
        const row = [...idempotency.values()].find(x => x.id === values?.[0]);
        if (row) { row.state = values?.[1]; row.status_code = values?.[3]; }
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  const syncClient = {
    async query(sql: string, values?: unknown[]) {
      sqlCalls.push({ sql, ...(values === undefined ? {} : { values }) });
      if (sql.startsWith("SELECT id FROM tontine_groups WHERE organization_id=$1 AND id=$2")) {
        const row = [...groups.values()].find(x => x.id === values?.[1]);
        return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.startsWith("SELECT id,currency FROM tontine_groups WHERE organization_id=$1 AND id=$2")) {
        const row = [...groups.values()].find(x => x.id === values?.[1]);
        return { rows: row ? [{ id: row.id, currency: row.currency }] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.startsWith("SELECT role FROM community_tontine_role_grants")) {
        return { rows: [{ role: "FOUNDER" }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO community_tontine_protection_policies")) {
        protectionPolicy={
          id:values?.[0],organization_id:values?.[1],group_id:values?.[2],version:values?.[3],currency:values?.[4],
          state:"DRAFT",proposal_origin:"COMMUNITY_ADMIN",risk_bearer:"LICENSED_INSURER",insurer_partner_id:values?.[5],
          insurer_license_reference:values?.[6],insurer_contract_reference:values?.[7],
          insurer_license_verified:false,insurer_contract_verified:false,effective_from:values?.[8],effective_until:values?.[9],
          tiers:JSON.parse(String(values?.[10])),policy_hash:values?.[11],created_by:values?.[12],approved_by:null
        };
        return {rows:[],rowCount:1};
      }
      if (sql.startsWith("SELECT * FROM community_tontine_protection_policies")) {
        return {rows:protectionPolicy?[protectionPolicy]:[],rowCount:protectionPolicy?1:0};
      }
      if (sql.startsWith("INSERT INTO community_tontine_insurer_verification_evidence")) {
        protectionEvidence.push({id:values?.[0],document_type:values?.[4],verified_by:values?.[7],evidence_sha256:values?.[6]});
        return {rows:[],rowCount:1};
      }
      if (sql.startsWith("UPDATE community_tontine_protection_policies SET insurer_license_verified")) {
        if(protectionPolicy){protectionPolicy.insurer_license_verified=true;protectionPolicy.insurer_contract_verified=true;protectionPolicy.policy_hash=values?.[4];}
        return {rows:[],rowCount:1};
      }
      if (sql.startsWith("SELECT COUNT(*)::integer AS total")) {
        const latestTypes=new Set(protectionEvidence.map(item=>item.document_type));
        return {rows:[{total:latestTypes.size,independent:protectionEvidence.every(item=>item.verified_by!=="55555555-5555-4555-8555-555555555555")}],rowCount:1};
      }
      if (sql.startsWith("UPDATE community_tontine_protection_policies SET state='APPROVED'")) {
        if(protectionPolicy){protectionPolicy.state="APPROVED";protectionPolicy.approved_by=values?.[3];}
        return {rows:[],rowCount:1};
      }
      if (sql.startsWith("UPDATE community_tontine_protection_policies SET state='RETIRED'")) {
        if(protectionPolicy?.state==="ACTIVE")protectionPolicy.state="RETIRED";
        return {rows:[],rowCount:1};
      }
      if (sql.startsWith("UPDATE community_tontine_protection_policies SET state='ACTIVE'")) {
        if(protectionPolicy){protectionPolicy.state="ACTIVE";protectionPolicy.activated_at=values?.[3];}
        return {rows:[],rowCount:1};
      }
      if (sql.startsWith("SELECT id FROM tontine_memberships WHERE organization_id=$1 AND group_id=$2 AND client_id=$3 AND status='active' LIMIT 1")) {
        return { rows: [{ id: "77777777-7777-4777-8777-777777777777" }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO tontine_groups")) {
        const row = {
          id: values?.[0], organization_id: values?.[1], name: values?.[2],
          country_code: values?.[3], currency: values?.[4], frequency: values?.[5],
          contribution_mode: values?.[6], target_minor: values?.[7], fixed_amount_minor: values?.[8],
          minimum_amount_minor: values?.[9], cycle_number: 1, max_members: values?.[10],
          governance: values?.[11], status: "draft", created_by: values?.[12],
          created_at: values?.[13], idempotency_key: values?.[14]
        };
        groups.set(String(values?.[14]), row);
        return { rows: [row], rowCount: 1 };
      }
      if (sql.startsWith("SELECT * FROM tontine_groups WHERE organization_id=$1 AND idempotency_key=$2")) {
        const row = groups.get(String(values?.[1]));
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("FROM tontine_groups g")) {
        return { rows: [...groups.values()].map(row => ({
          ...row, active_member_count: 1, pending_member_count: 0, latest_cycle: null,
          confirmed_contribution_count: 0, confirmed_contribution_minor: "0"
        })), rowCount: groups.size };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const auth = {
    principal: {
      userId: "55555555-5555-4555-8555-555555555555",
      organizationId: "33333333-3333-4333-8333-333333333333",
      permissions: ["community.tontine.read", "community.groups.manage", "community.members.manage", "community.commission.propose.admin", "community.governance.propose", "community.protection.verify", "community.protection.approve", "community.protection.activate"] as const,
      sessionId: "11111111-1111-4111-8111-111111111111"
    },
    tenantId: "tenant-alpha",
    session: {
      sessionId: "11111111-1111-4111-8111-111111111111",
      userId: "55555555-5555-4555-8555-555555555555",
      organizationId: "33333333-3333-4333-8333-333333333333",
      createdAt: Date.now() - 1000, expiresAt: Date.now() + 60000, assurance: "standard" as const
    }
  };
  const server = createSchoolApiServer({
    db: db as any,
    authenticate: async () => auth,
    syncClient: async () => syncClient as any,
    now: () => new Date("2026-11-17T07:00:00.000Z")
  });
  return { server, sqlCalls, setActor:(id:string)=>{auth.principal.userId=id;auth.session.userId=id;} };
}

test("Community Tontine group create, idempotent replay and list use scoped PostgreSQL transactions", async () => {
  const { server, sqlCalls } = fixture();
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  try {
    const payload = {
      name: "Solidarité Lomé",
      countryCode: "TG",
      currency: "XOF",
      frequency: "weekly",
      contributionMode: "fixed",
      minimumAmountMinor: "500",
      fixedAmountMinor: "500",
      governance: "member_vote",
      maxMembers: 30
    };
    const headers = {
      "content-type": "application/json",
      "x-idempotency-key": "tontine-create-0001"
    };
    const created = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups`, {
      method: "POST", headers, body: JSON.stringify(payload)
    });
    const createdBody = await created.json() as any;
    assert.equal(created.status, 200, JSON.stringify(createdBody));
    assert.equal(createdBody.data.group.name, "Solidarité Lomé");
    assert.equal(createdBody.data.group.status, "draft");
    assert.ok(sqlCalls.some(x => x.sql.startsWith("INSERT INTO tontine_memberships")));

    const replay = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups`, {
      method: "POST", headers, body: JSON.stringify(payload)
    });
    const replayBody = await replay.json() as any;
    assert.equal(replay.status, 200, JSON.stringify(replayBody));
    assert.equal(replayBody.data.group.id, createdBody.data.group.id);
    assert.equal(replayBody.data.replayed, true);

    const listed = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups?limit=25`);
    const listedBody = await listed.json() as any;
    assert.equal(listed.status, 200, JSON.stringify(listedBody));
    assert.equal(listedBody.data.items.length, 1);
    assert.equal(listedBody.data.items[0].id, createdBody.data.group.id);
    assert.ok(sqlCalls.filter(x => x.sql.includes("set_config('tpay.organization_id'")).length >= 3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("Community Tontine group creation rejects invalid frequency and amount before SQL mutation", async () => {
  const { server, sqlCalls } = fixture();
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-idempotency-key": "tontine-invalid-0001" },
      body: JSON.stringify({
        name: "Invalid", countryCode: "TG", currency: "XOF", frequency: "hourly",
        contributionMode: "fixed", minimumAmountMinor: "500", fixedAmountMinor: "500"
      })
    });
    assert.equal(response.status, 400);
    assert.equal(sqlCalls.some(x => x.sql.startsWith("INSERT INTO tontine_groups")), false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test("Community Tontine commission policy, temporal roles and promotion draft use authenticated group administration", async () => {
  const { server, sqlCalls } = fixture();
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  try {
    const groupResponse = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-idempotency-key": "tontine-admin-group-01" },
      body: JSON.stringify({
        name: "Communauté Test", countryCode: "TG", currency: "XOF", frequency: "weekly",
        contributionMode: "fixed", minimumAmountMinor: "1000", fixedAmountMinor: "1000"
      })
    });
    const groupBody = await groupResponse.json() as any;
    assert.equal(groupResponse.status, 200, JSON.stringify(groupBody));
    const groupId = groupBody.data.group.id as string;

    const commission = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/commission-policies`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-idempotency-key": "tontine-commission-01" },
      body: JSON.stringify({
        version: "community-v1", transactionLevel: "CONTRIBUTION", currency: "XOF",
        payer: "SPLIT", memberShareBps: 6000, effectiveFrom: "2026-11-17T06:00:00.000Z",
        components: [
          { recipient: "TPAY", rateBps: 100, enabled: true },
          { recipient: "PARTNER", rateBps: 50, enabled: true },
          { recipient: "AGENT", rateBps: 25, enabled: true }
        ]
      })
    });
    const commissionBody = await commission.json() as any;
    assert.equal(commission.status, 200, JSON.stringify(commissionBody));
    assert.equal(commissionBody.data.policy.state, "DRAFT");
    assert.equal(commissionBody.data.policy.policyHash.length, 64);
    assert.equal(commissionBody.data.policy.proposalOrigin, "COMMUNITY_ADMIN");
    assert.ok(sqlCalls.some(x => x.sql.startsWith("INSERT INTO community_tontine_commission_policies") && x.sql.includes("proposal_origin")));

    const role = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/roles`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-idempotency-key": "tontine-role-grant-01" },
      body: JSON.stringify({
        actorId: "66666666-6666-4666-8666-666666666666", role: "PRESIDENT",
        permissions: ["member.invite"], validFrom: "2026-11-17T07:00:00.000Z",
        expiresAt: "2026-11-17T08:00:00.000Z"
      })
    });
    const roleBody = await role.json() as any;
    assert.equal(role.status, 200, JSON.stringify(roleBody));
    assert.equal(roleBody.data.role, "PRESIDENT");
    assert.ok(sqlCalls.some(x => x.sql.startsWith("INSERT INTO community_tontine_role_grants")));

    const promotion = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/promotions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-idempotency-key": "tontine-promo-create-01" },
      body: JSON.stringify({
        code: "LOME2026", title: "Lancement communautaire",
        startsAt: "2026-11-17T06:00:00.000Z", endsAt: "2026-11-30T23:59:59.000Z",
        currency: "XOF", rewardMinor: "1000", maxRedemptions: 10, maxBudgetMinor: "10000",
        allowedChannels: ["LINK", "QR"]
      })
    });
    const promotionBody = await promotion.json() as any;
    assert.equal(promotion.status, 200, JSON.stringify(promotionBody));
    assert.equal(promotionBody.data.state, "DRAFT");
    assert.ok(sqlCalls.some(x => x.sql.startsWith("INSERT INTO community_tontine_promotion_campaigns")));
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("CT-042 policy proposal is tenant-scoped, draft-only and never writes a ledger entry", async () => {
  const { server, sqlCalls } = fixture();
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  try {
    const groupResponse = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-idempotency-key": "ct042-group-create-01" },
      body: JSON.stringify({
        name: "Protection Test", countryCode: "TG", currency: "XOF", frequency: "weekly",
        contributionMode: "fixed", minimumAmountMinor: "1000", fixedAmountMinor: "1000"
      })
    });
    const groupBody = await groupResponse.json() as any;
    assert.equal(groupResponse.status, 200, JSON.stringify(groupBody));
    const groupId = groupBody.data.group.id as string;

    const response = await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/protection-policies`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-idempotency-key": "ct042-policy-create-01" },
      body: JSON.stringify({
        version: "ct042-v1", currency: "XOF",
        insurerPartnerId: "88888888-8888-4888-8888-888888888888",
        insurerLicenseReference: "CIMA-REF-TO-VERIFY",
        insurerContractReference: "CONTRACT-REF-TO-VERIFY",
        effectiveFrom: "2026-11-18T08:00:00.000Z",
        // Test-only proposed terms. They are not approved actuarial rates or an active contract.
        tiers: [
          { tier: "ESSENTIEL", premiumRateBps: 100, coveredInstallments: 1, gracePeriodDays: 7, waitingPeriodDays: 30, maxClaimMinor: "10000" },
          { tier: "EQUILIBRE", premiumRateBps: 200, coveredInstallments: 2, gracePeriodDays: 14, waitingPeriodDays: 30, maxClaimMinor: "20000" },
          { tier: "RENFORCE", premiumRateBps: 300, coveredInstallments: 3, gracePeriodDays: 21, waitingPeriodDays: 30, maxClaimMinor: "30000" }
        ]
      })
    });
    const body = await response.json() as any;
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.data.state, "DRAFT");
    assert.equal(body.data.insurerVerificationRequired, true);
    assert.ok(sqlCalls.some(x => x.sql.startsWith("INSERT INTO community_tontine_protection_policies")));
    assert.ok(sqlCalls.some(x => x.sql.startsWith("INSERT INTO community_tontine_protection_events")));
    assert.equal(sqlCalls.some(x => /INSERT INTO .*ledger|UPDATE .*ledger/i.test(x.sql)), false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test("CT-042 insurer evidence, independent approval and activation use distinct permissions and atomic policy transitions",async()=>{
  const {server,sqlCalls,setActor}=fixture();
  await new Promise<void>(resolve=>server.listen(0,resolve));
  const port=(server.address() as any).port;
  try{
    const groupResponse=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups`,{
      method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"ct042-gov-group-001"},
      body:JSON.stringify({name:"CT042 Governance",countryCode:"TG",currency:"XOF",frequency:"weekly",contributionMode:"fixed",minimumAmountMinor:"1000",fixedAmountMinor:"1000"})
    });
    const groupBody=await groupResponse.json() as any;
    assert.equal(groupResponse.status,200,JSON.stringify(groupBody));
    const actualGroupId=String(groupBody.data.group.id);
    const proposal=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${actualGroupId}/protection-policies`,{
      method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"ct042-gov-policy-001"},
      body:JSON.stringify({
        version:"ct042-gov-v1",currency:"XOF",insurerPartnerId:"88888888-8888-4888-8888-888888888888",
        insurerLicenseReference:"LICENCE-REF",insurerContractReference:"CONTRACT-REF",
        effectiveFrom:"2026-11-17T06:00:00.000Z",
        tiers:[
          {tier:"ESSENTIEL",premiumRateBps:100,coveredInstallments:1,gracePeriodDays:7,waitingPeriodDays:14,maxClaimMinor:"10000"},
          {tier:"EQUILIBRE",premiumRateBps:200,coveredInstallments:2,gracePeriodDays:14,waitingPeriodDays:14,maxClaimMinor:"20000"},
          {tier:"RENFORCE",premiumRateBps:300,coveredInstallments:3,gracePeriodDays:21,waitingPeriodDays:30,maxClaimMinor:"30000"}
        ]
      })
    });
    const proposalBody=await proposal.json() as any;
    assert.equal(proposal.status,200,JSON.stringify(proposalBody));
    assert.equal(proposalBody.data.state,"DRAFT");
    const actualPolicyId=String(proposalBody.data.id);

    setActor("66666666-6666-4666-8666-666666666666");
    const verify=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${actualGroupId}/protection-policies/${actualPolicyId}/verify-insurer`,{
      method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"ct042-gov-verify-001"},
      body:JSON.stringify({
        licenseEvidenceReference:"vault://insurer/licence/1",licenseEvidenceSha256:"a".repeat(64),
        contractEvidenceReference:"vault://insurer/contract/1",contractEvidenceSha256:"b".repeat(64)
      })
    });
    const verifyBody=await verify.json() as any;
    assert.equal(verify.status,200,JSON.stringify(verifyBody));
    assert.equal(verifyBody.data.evidenceRecorded,true);
    assert.ok(sqlCalls.filter(call=>call.sql.startsWith("INSERT INTO community_tontine_insurer_verification_evidence")).length===2);

    setActor("77777777-7777-4777-8777-777777777777");
    const approve=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${actualGroupId}/protection-policies/${actualPolicyId}/approve`,{
      method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"ct042-gov-approve-001"},body:"{}"
    });
    const approveBody=await approve.json() as any;
    assert.equal(approve.status,200,JSON.stringify(approveBody));
    assert.equal(approveBody.data.state,"APPROVED");

    setActor("88888888-8888-4888-8888-888888888888");
    const activate=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${actualGroupId}/protection-policies/${actualPolicyId}/activate`,{
      method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"ct042-gov-activate-001"},body:"{}"
    });
    const activateBody=await activate.json() as any;
    assert.equal(activate.status,200,JSON.stringify(activateBody));
    assert.equal(activateBody.data.state,"ACTIVE");
    assert.equal(sqlCalls.some(call=>/INSERT INTO .*ledger|UPDATE .*ledger/i.test(call.sql)),false);
  }finally{
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
