import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { recordTontineProviderIncident } from "../packages/microfinance/src/tontine-provider-incident.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P057.3 live PostgreSQL atomically creates one system incident, immutable evidence and one outbox event",
  {skip:!databaseUrl && "TPAY_DATABASE_URL is not configured"},async()=>{
    const client=new pg.Client({connectionString:databaseUrl});
    await client.connect();
    const organizationId=randomUUID();
    const groupId=randomUUID();
    const cycleId=randomUUID();
    const actorId=randomUUID();
    const now=new Date().toISOString();
    const providerEventId="evt-"+randomUUID();
    const tx:TontineSqlExecutor={
      async query<Row=Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){
        const result=await client.query(sql,[...values]);
        return {rows:result.rows as Row[],rowCount:result.rowCount??0};
      },
      async transaction<T>(work:(executor:TontineSqlExecutor)=>Promise<T>){return work(this);}
    };
    try{
      await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
      await client.query("BEGIN");
      await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)",
        [organizationId,"P057.3 incident integration",now]);
      await client.query(
        `INSERT INTO tontine_groups
          (id,organization_id,name,country_code,currency,frequency,contribution_mode,
           fixed_amount_minor,minimum_amount_minor,cycle_number,governance,status,created_by,created_at)
         VALUES ($1,$2,'Incident test','TG','XOF','daily','fixed',1000,100,1,'founder_managed','active',$3,$4)`,
        [groupId,organizationId,actorId,now]);
      await client.query(
        `INSERT INTO tontine_cycles
          (id,organization_id,group_id,cycle_number,starts_on,ends_on,status,rules_version,
           minimum_amount_minor,currency,created_at)
         VALUES ($1,$2,$3,1,CURRENT_DATE,CURRENT_DATE,'open','v1',100,'XOF',$4)`,
        [cycleId,organizationId,groupId,now]);

      const input={
        organizationId:organizationId as never,cycleId,provider:"tmoney",providerEventId,
        rawBody:"provider callback body that must not be stored",
        occurredAt:now,reason:"PAYOUT_NOT_APPROVED" as const
      };
      const first=await recordTontineProviderIncident(tx,input);
      const replay=await recordTontineProviderIncident(tx,input);
      assert.ok(first.caseId);
      assert.equal(first.created,true);
      assert.deepEqual(replay,{caseId:first.caseId,created:false});

      const counts=await client.query(
        `SELECT
          (SELECT count(*)::int FROM tontine_cases WHERE id=$1) AS cases,
          (SELECT count(*)::int FROM tontine_case_evidence WHERE case_id=$1) AS evidence,
          (SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1 AND event_type='tontine.provider_incident.opened') AS outbox,
          (SELECT opened_by IS NULL AND opened_by_system FROM tontine_cases WHERE id=$1) AS system_case,
          (SELECT captured_by IS NULL AND captured_by_system FROM tontine_case_evidence WHERE case_id=$1) AS system_evidence`,
        [first.caseId]);
      assert.deepEqual(counts.rows[0],{
        cases:1,evidence:1,outbox:1,system_case:true,system_evidence:true
      });
      await assert.rejects(
        client.query("UPDATE tontine_case_evidence SET object_reference='tampered' WHERE case_id=$1",[first.caseId]),
        /TONTINE_CASE_EVIDENCE_APPEND_ONLY/
      );
      await client.query("ROLLBACK");
    }catch(error){
      await client.query("ROLLBACK").catch(()=>undefined);
      throw error;
    }finally{
      await client.end();
    }
  });
