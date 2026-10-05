export interface ResourceBudget { readonly maxCalls:number; readonly maxInputBytes:number; readonly maxOutputBytes:number; readonly maxWallTimeMs:number; }
export class ResourceBudgetGuard {
  private calls=0; private readonly started=Date.now();
  constructor(private readonly budget:ResourceBudget){}
  consume(inputBytes:number,outputBytes=0):void{
    this.calls++;
    if(this.calls>this.budget.maxCalls)throw new Error("RESOURCE_CALL_BUDGET_EXCEEDED");
    if(inputBytes>this.budget.maxInputBytes||outputBytes>this.budget.maxOutputBytes)throw new Error("RESOURCE_PAYLOAD_BUDGET_EXCEEDED");
    if(Date.now()-this.started>this.budget.maxWallTimeMs)throw new Error("RESOURCE_TIME_BUDGET_EXCEEDED");
  }
}