import test from "node:test";import assert from "node:assert/strict";
import {assertRailUsageAllowed,assertTpayDoesNotIssueStoredValue} from "../packages/microfinance/src/regulatory-boundary.js";
test("T.Pay technology-provider role cannot silently become an e-money issuer",()=>{
 const p={countryCode:"TG",tpayRole:"technology_provider" as const,authorizedForElectronicMoney:false,authorizedForPaymentServices:false};
 assert.doesNotThrow(()=>assertRailUsageAllowed(p,"tmoney"));
 assert.doesNotThrow(()=>assertTpayDoesNotIssueStoredValue(p));
});
test("regulatory profile contradictions are rejected",()=>{
 const p={countryCode:"TG",tpayRole:"technology_provider" as const,authorizedForElectronicMoney:true,authorizedForPaymentServices:false};
 assert.throws(()=>assertTpayDoesNotIssueStoredValue(p),/REGULATORY_PROFILE_CONTRADICTION/);
});
