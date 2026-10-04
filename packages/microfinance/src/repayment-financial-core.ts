import {money} from "../../finance/src/ledger.js";import {postFinancialTransaction,type PostFinancialTransactionResult} from "../../finance/src/transactional-ledger.js";import type {FinancialUnitOfWork} from "../../finance/src/persistence.js";import type {RepaymentIntent} from "./repayment-recovery.js";import {buildRepaymentLedgerIdempotency} from "./repayment-recovery.js";
export async function settleRepayment(uow:FinancialUnitOfWork,i:RepaymentIntent,sourceAccountId:string,loanAccountId:string,transactionId:string,now=new Date().toISOString()):Promise<PostFinancialTransactionResult>{
 if(i.status!=="settled"&&i.status!=="accepted")throw new Error("REPAYMENT_NOT_SETTLEABLE");
 return postFinancialTransaction(uow,{id:transactionId,organizationId:i.organizationId,idempotencyKey:buildRepaymentLedgerIdempotency(i),occurredAt:now,postedAt:now,lines:[
  {accountId:sourceAccountId,amount:money(i.currency,i.amountMinor),direction:"debit"},
  {accountId:loanAccountId,amount:money(i.currency,i.amountMinor),direction:"credit"}]});
}
