import {money,type Money} from "./ledger.js";

export interface CommissionRule { id:string; name:string; rateBps:number; minMinor?:bigint; maxMinor?:bigint; active:boolean; }
export function calculateCommission(base:Money,rule:CommissionRule):Money{
  if(!rule.active) throw new Error("COMMISSION_RULE_INACTIVE");
  if(rule.rateBps<0||rule.rateBps>10000) throw new Error("INVALID_COMMISSION_RATE");
  let amount=(base.minor*BigInt(rule.rateBps))/10000n;
  if(rule.minMinor!==undefined && amount<rule.minMinor) amount=rule.minMinor;
  if(rule.maxMinor!==undefined && amount>rule.maxMinor) amount=rule.maxMinor;
  return money(base.currency,amount);
}