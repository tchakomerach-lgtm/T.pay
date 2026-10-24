import {money,type Money} from "./ledger.js";
import { calculateCommissionWithCobol } from "./cobol-commission.js";

export interface CommissionRule { id:string; name:string; rateBps:number; minMinor?:bigint; maxMinor?:bigint; active:boolean; }
export function calculateCommission(base:Money,rule:CommissionRule):Money{
  if(!rule.active) throw new Error("COMMISSION_RULE_INACTIVE");
  if(rule.rateBps<0||rule.rateBps>10000||!Number.isInteger(rule.rateBps)) throw new Error("INVALID_COMMISSION_RATE");
  let amount:bigint;
  if(process.env.TPAY_FINANCE_ENGINE==="cobol"){
    amount=calculateCommissionWithCobol({baseMinor:base.minor,rateBps:rule.rateBps,...(rule.minMinor!==undefined?{minMinor:rule.minMinor}:{}),...(rule.maxMinor!==undefined?{maxMinor:rule.maxMinor}:{})});
  }else{
    amount=(base.minor*BigInt(rule.rateBps))/10000n;
    if(rule.minMinor!==undefined && amount<rule.minMinor) amount=rule.minMinor;
    if(rule.maxMinor!==undefined && amount>rule.maxMinor) amount=rule.maxMinor;
  }
  return money(base.currency,amount);
}
