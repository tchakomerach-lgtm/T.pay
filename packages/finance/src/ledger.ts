export interface Money { currency:string; minor:bigint; }
export interface LedgerLine { accountId:string; amount:Money; direction:"debit"|"credit"; }
export function money(currency:string, minor:bigint):Money { if(!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY"); if(minor<0n) throw new Error("NEGATIVE_MONEY_NOT_ALLOWED"); return {currency,minor}; }
export function assertBalanced(lines:readonly LedgerLine[]):void {
 if(lines.length<2) throw new Error("LEDGER_MINIMUM_TWO_LINES");
 const currencies=new Set(lines.map(l=>l.amount.currency)); if(currencies.size!==1) throw new Error("LEDGER_CURRENCY_MISMATCH");
 let debit=0n, credit=0n; for(const l of lines){ if(l.amount.minor<0n) throw new Error("NEGATIVE_LEDGER_AMOUNT"); if(l.direction==="debit") debit+=l.amount.minor; else credit+=l.amount.minor; }
 if(debit!==credit) throw new Error("LEDGER_UNBALANCED");
}