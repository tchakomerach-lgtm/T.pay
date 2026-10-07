import test from "node:test";
import assert from "node:assert/strict";
import {PostgresSchoolRealtimeStore} from "../packages/education/src/postgres-realtime-store.js";
import type {SchoolRealtimeEvent} from "../packages/education/src/school-realtime.js";

class FakeClient{
  queries:string[]=[];
  async query(sql:string,_values?:unknown[]){
    this.queries.push(sql.trim());
    if(sql.includes("SELECT min(stream_sequence)"))return {rows:[{oldest:"10",latest:"12"}]};
    if(sql.includes("SELECT id,stream_sequence"))return {rows:[{id:"e11",stream_sequence:"11",event_type:"attendance.changed",occurred_at:"2026-10-07T00:00:00.000Z",entity_id:"s",version:"1",data:{}}]};
    if(sql==="BEGIN ISOLATION LEVEL REPEATABLE READ"||sql==="COMMIT"||sql==="ROLLBACK")return {rows:[],rowCount:0};
    throw new Error("UNEXPECTED_SQL");
  }
}
test("P048 replay uses one repeatable-read snapshot and preserves durable sequence",async()=>{
 const client=new FakeClient();const store=new PostgresSchoolRealtimeStore(client as any);
 const replay=await store.replay("tenant","org",10n,100);
 assert.equal(replay.state,"OK");assert.equal(replay.events[0]!.streamSequence,"11");
 assert.equal(client.queries[0],"BEGIN ISOLATION LEVEL REPEATABLE READ");
 assert.equal(client.queries.at(-1),"COMMIT");
});
test("P048 cursor before retained history is explicitly expired",async()=>{
 const client=new FakeClient();const store=new PostgresSchoolRealtimeStore(client as any);
 const replay=await store.replay("tenant","org",0n,100);
 assert.equal(replay.state,"CURSOR_EXPIRED");assert.equal(replay.events.length,0);
 assert.equal(client.queries.at(-1),"COMMIT");
});
