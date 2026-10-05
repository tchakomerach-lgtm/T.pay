import {createHash} from "node:crypto";
export interface ReplayKey { readonly scope:string; readonly actionId:string; readonly payloadHash:string; readonly expiresAt:number; }
export class ReplayGuard {
 private readonly seen=new Map<string,number>();
 claim(key:ReplayKey,now=Date.now()):void{if(!key.scope.trim()||!key.actionId.trim()||!key.payloadHash.trim()||key.expiresAt<=now)throw new Error("REPLAY_CONTEXT_INVALID");this.prune(now);const id=this.key(key);const previous=this.seen.get(id);if(previous!==undefined&&previous>now)throw new Error("ACTION_REPLAY_DETECTED");this.seen.set(id,key.expiresAt);}
 private key(k:ReplayKey):string{return createHash("sha256").update(k.scope+"|"+k.actionId+"|"+k.payloadHash,"utf8").digest("hex");}
 private prune(now:number):void{for(const [k,e] of this.seen)if(e<=now)this.seen.delete(k);}
 size():number{return this.seen.size;}
}
