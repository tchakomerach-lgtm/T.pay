import test from "node:test";
import assert from "node:assert/strict";
import {schoolMetric,schoolTelemetry} from "../packages/education/src/school-observability.js";

test("P046 School telemetry is bounded and privacy-safe",()=>{
  assert.equal(schoolMetric("realtime","event_lag"),"tpay.education.realtime.event_lag");
  const output=schoolTelemetry({serviceName:"education-api",traceId:"t",correlationId:"c",organizationId:"org",actorId:"actor"},{
    operation:"attendance.changed",outcome:"accepted",durationMs:12,freshnessMs:50,confidence:.98,queueDepth:2,eventLagMs:30,realtimeHealth:"CONNECTED",syncState:"HEALTHY"
  });
  assert.equal(output.organization_id,"org");assert.equal(output.actor_id,"actor");
  assert.throws(()=>schoolTelemetry({serviceName:"x",traceId:"t",correlationId:"c"},{
    operation:"x",outcome:"accepted",durationMs:1,freshnessMs:null,confidence:2,queueDepth:0,eventLagMs:null,realtimeHealth:"UNKNOWN",syncState:"UNKNOWN"
  }),/SCHOOL_TELEMETRY_CONFIDENCE_INVALID/);
  const redacted=schoolTelemetry({serviceName:"x",traceId:"t",correlationId:"c"},{
    operation:"x",outcome:"accepted",durationMs:1,freshnessMs:null,confidence:null,queueDepth:0,eventLagMs:null,realtimeHealth:"UNKNOWN",syncState:"UNKNOWN"
  });
  assert.equal(redacted.actor_id,undefined);
});
