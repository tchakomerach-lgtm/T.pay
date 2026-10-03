import {assertBalanced,money,type LedgerLine} from "./ledger.js";

export type PaymentStatus="initiated"|"pending"|"completed"|"failed"|"cancelled";

export interface Payment {
  id:string; organizationId:string; payerAccountId:string; payeeAccountId:string;
  amount:{currency:string;minor:bigint}; status:PaymentStatus; idempotencyKey:string;
  createdAt:string;
}

export function paymentLines(payment:Payment):readonly LedgerLine[]{
  return [
    {accountId:payment.payerAccountId,amount:money(payment.amount.currency,payment.amount.minor),direction:"debit"},
    {accountId:payment.payeeAccountId,amount:money(payment.amount.currency,payment.amount.minor),direction:"credit"}
  ];
}

export function validatePayment(payment:Payment):void{
  if(payment.payerAccountId===payment.payeeAccountId) throw new Error("SAME_PAYMENT_ACCOUNT");
  if(payment.status==="completed" || payment.status==="cancelled") throw new Error("PAYMENT_NOT_MUTABLE");
  if(payment.amount.minor<=0n) throw new Error("PAYMENT_AMOUNT_MUST_BE_POSITIVE");
  assertBalanced(paymentLines(payment));
}