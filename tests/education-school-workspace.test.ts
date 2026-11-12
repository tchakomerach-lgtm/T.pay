import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";

function context(overrides:Partial<{tenantId:string;organizationId:string;permissions:string[]}>={}){
 const tenantId=overrides.tenantId??"tenant-1";
 const organizationId=overrides.organizationId??"org-1";
 return {
  principal:{userId:"director-1",organizationId,permissions:overrides.permissions??["org.read"],sessionId:"session-1"},
  tenantId,
  session:{sessionId:"session-1",userId:"director-1",organizationId,createdAt:Date.now()-1000,expiresAt:Date.now()+60000,assurance:"standard" as const}
 };
}
function createDb(){
 const calls:Array<{sql:string;values?:unknown[]}>=[];
 const db={
  calls,
  async query(sql:string,values?:unknown[]){calls.push({sql,values});return {rows:[],rowCount:0};}
 };
 return db;
}
function createReadClient(rows:Record<string,unknown>[]){
 const calls:Array<{sql:string;values?:unknown[]}>=[];
 let released=false;
 return {
  calls,get released(){return released;},
  async query(sql:string,values?:unknown[]){
   calls.push({sql,values});
   if(sql.startsWith("SELECT c.class_id"))return {rows,rowCount:rows.length};
   if(sql.startsWith("SELECT s.student_id"))return {rows,rowCount:rows.length};
   return {rows:[],rowCount:0};
  },
  release(){released=true;}
 };
}
async function withServer(handler:(port:number)=>Promise<void>){
 const db=createDb();
 const server=createSchoolApiServer({
  db:db as any,
  authenticate:async()=>context() as any,
  syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any
 });
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as {port:number}).port;
 try{await handler(port);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

test("School classes endpoint returns tenant-scoped class summaries through transaction-local RLS context",async()=>{
 const rows=[{class_id:"class-1",name:"6e A",grade_level:"6e",academic_year:"2026-2027",capacity:45,status:"ACTIVE",version:"1",enrolled_count:32}];
 const client=createReadClient(rows);
 const db=createDb();
 const server=createSchoolApiServer({db:db as any,authenticate:async()=>context() as any,syncClient:()=>client as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as {port:number}).port;
 try{
  const response=await fetch("http://127.0.0.1:"+port+"/v1/education/classes?academicYear=2026-2027");
  const body=await response.json() as any;
  assert.equal(response.status,200);
  assert.deepEqual(body.data.items,rows);
  assert.ok(db.calls.some(call=>call.sql.includes("INSERT INTO api_request_audit")));
  assert.deepEqual(client.calls[1]?.values,["tenant-1","org-1"]);
  assert.match(client.calls[2]!.sql,/c\.tenant_id=\$1 AND c\.organization_id=\$2/);
  assert.deepEqual(client.calls[2]?.values,["tenant-1","org-1","2026-2027"]);
  assert.equal(client.calls[0]?.sql,"BEGIN READ ONLY");
  assert.equal(client.calls[3]?.sql,"COMMIT");
  assert.equal(client.released,true);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("School student endpoint bounds page size and binds search/filter parameters",async()=>{
 const rows=[{student_id:"student-1",display_name:"Ama Doe",lifecycle:"ACTIVE",class_id:"class-1",academic_year:"2026-2027",enrollment_state:"ENROLLED"}];
 const client=createReadClient(rows);
 const server=createSchoolApiServer({db:createDb() as any,authenticate:async()=>context() as any,syncClient:()=>client as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as {port:number}).port;
 try{
  const response=await fetch("http://127.0.0.1:"+port+"/v1/education/students?classId=class-1&search=Ama&limit=25");
  const body=await response.json() as any;
  assert.equal(response.status,200);
  assert.deepEqual(body.data.items,rows);
  assert.deepEqual(client.calls[2]?.values,["tenant-1","org-1","class-1","%Ama%",25]);
  assert.match(client.calls[2]!.sql,/s\.tenant_id=\$1 AND s\.organization_id=\$2/);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("School list endpoints reject malformed filters before querying PostgreSQL",async()=>{
 let connected=false;
 const server=createSchoolApiServer({db:createDb() as any,authenticate:async()=>context() as any,syncClient:()=>{connected=true;return createReadClient([]) as any;}});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as {port:number}).port;
 try{
  const badYear=await fetch("http://127.0.0.1:"+port+"/v1/education/classes?academicYear=2026");
  const badLimit=await fetch("http://127.0.0.1:"+port+"/v1/education/students?limit=1000");
  assert.equal(badYear.status,400);
  assert.equal(badLimit.status,400);
  assert.equal(connected,false);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("School class and student list routes require organization read permission",async()=>{
 const server=createSchoolApiServer({db:createDb() as any,authenticate:async()=>context({permissions:[]}) as any,syncClient:()=>createReadClient([]) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as {port:number}).port;
 try{
  const classes=await fetch("http://127.0.0.1:"+port+"/v1/education/classes");
  const students=await fetch("http://127.0.0.1:"+port+"/v1/education/students");
  assert.equal(classes.status,403);
  assert.equal(students.status,403);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
