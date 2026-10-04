import {money} from "../../finance/src/ledger.js";import {postFinancialTransaction,type PostFinancialTransactionResult} from "../../finance/src/transactional-ledger.js";import type {FinancialUnitOfWork} from "../../finance/src/persistence.js";import type {SchoolFinanceRecoveryIntent} from "./school-finance.js";
export function buildSchoolRecoveryLedgerIdempotency(r:SchoolFinanceRecoveryIntent):string{return `school-recovery:${r.organizationId}:${r.recoveryId}`;}
export async function settleSchoolRecovery(uow:FinancialUnitOfWork,r:SchoolFinanceRecoveryIntent,sourceAccountId:string,schoolReceivableAccountId:string,transactionId:string,now=new Date().toISOString()):Promise<PostFinancialTransactionResult>{
 if(r.status!=="accepted")throw new Error("SCHOOL_RECOVERY_NOT_SETTLEABLE");
 return postFinancialTransaction(uow,{id:transactionId,organizationId:r.organizationId,idempotencyKey:buildSchoolRecoveryLedgerIdempotency(r),occurredAt:now,postedAt:now,lines:[
  {accountId:sourceAccountId,amount:money(r.currency,r.amountMinor),direction:"debit"},
  {accountId:schoolReceivableAccountId,amount:money(r.currency,r.amountMinor),direction:"credit"}]});
}
