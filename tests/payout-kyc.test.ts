import test from "node:test";import assert from "node:assert/strict";import {assertPayoutBeneficiaryEligible} from "../packages/finance/src/payout-kyc.js";
const payout:any={organizationId:"org1",beneficiaryId:"user1",kycVerified:true};
test("L7 KYC eligibility accepts current verified beneficiary",()=>assert.doesNotThrow(()=>assertPayoutBeneficiaryEligible({payout,profile:{id:"k1",userId:"user1",status:"verified",countryCode:"TG"}})));
test("L7 KYC eligibility rejects expired evidence",()=>assert.throws(()=>assertPayoutBeneficiaryEligible({payout,profile:{id:"k1",userId:"user1",status:"verified",countryCode:"TG",expiresAt:"2020-01-01T00:00:00Z"}}),/KYC_EXPIRED/));
