import test from "node:test";
import assert from "node:assert/strict";
import { assertUniversalObject } from "../apps/design/objects.js";
import { assertObjectPresentation } from "../apps/design/object-presentation.js";
import { assertActionPresentation } from "../apps/design/action-presentation.js";
import { assertRealtimePresentation } from "../apps/design/realtime-presentation.js";
import { assertSyncPresentation } from "../apps/design/sync-presentation.js";
import { assertFieldDisplayPolicy } from "../apps/design/field-mode.js";

const object = {
  objectType:"payment", objectId:"pay-1", contextId:"org-1", organizationId:"org-1",
  title:"Paiement", status:"pending" as const, sensitivity:"sensitive" as const,
  freshness:"fresh" as const, sync:"synced" as const, version:1, availableActions:["view"]
};

test("universal object requires tenant binding for non-public data", () => {
  assert.throws(() => assertUniversalObject({...object, organizationId:undefined}));
});
test("object presentation redacts sensitive fields", () => {
  assert.throws(() => assertObjectPresentation({...{object,headingLevel:2,showStatus:true,showFreshness:true,showContext:true,showActivity:true,compact:false},sensitiveFieldsHidden:false}));
  assert.doesNotThrow(() => assertObjectPresentation({...{object,headingLevel:2,showStatus:true,showFreshness:true,showContext:true,showActivity:true,compact:false},sensitiveFieldsHidden:true,redactionReason:"Données sensibles"}));
});
test("destructive actions cannot bypass confirmation", () => {
  const action={actionId:"a",verb:"supprimer",objectType:"document",objectId:"d",contextId:"org-1",state:"idle" as const,consequential:true};
  assert.throws(() => assertActionPresentation({action,label:"Supprimer",confirmationRequired:false,previewRequired:false,retryable:false,destructive:true}));
});
test("realtime presentation is accessible and never flashes the whole screen", () => {
  assert.throws(() => assertRealtimePresentation({freshness:"updated",sync:"synced",changedFields:[],announcement:"",visualDiff:true,screenFlash:false}));
  assert.throws(() => assertRealtimePresentation({freshness:"updated",sync:"synced",changedFields:[],announcement:"Mis à jour",visualDiff:true,screenFlash:true}));
});
test("sync conflict cannot be represented without affected conflicts", () => {
  const action={actionId:"a",verb:"modifier",objectType:"client",objectId:"c",contextId:"field-1",state:"conflict" as const,consequential:false};
  assert.throws(() => assertSyncPresentation({connection:"offline",queuedCount:1,conflictCount:0,action,localOutcome:"conflict"}));
});
test("field modes protect bandwidth and battery", () => {
  assert.throws(() => assertFieldDisplayPolicy({mode:"low-bandwidth",maxListItems:20,preferTextOverMedia:true,animationsEnabled:false,autoRefreshSeconds:30,allowLargeImages:true}));
  assert.doesNotThrow(() => assertFieldDisplayPolicy({mode:"low-bandwidth",maxListItems:20,preferTextOverMedia:true,animationsEnabled:false,autoRefreshSeconds:30,allowLargeImages:false}));
  assert.throws(() => assertFieldDisplayPolicy({mode:"offline",maxListItems:10,preferTextOverMedia:true,animationsEnabled:false,autoRefreshSeconds:30,allowLargeImages:false}));
});