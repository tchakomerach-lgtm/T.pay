export interface IdempotencyStore { has(key:string):Promise<boolean>; reserve(key:string):Promise<boolean>; }
export async function requireIdempotency(store:IdempotencyStore,key:string):Promise<void>{
 if(!key || key.length<16 || key.length>128) throw new Error("INVALID_IDEMPOTENCY_KEY");
 if(!(await store.reserve(key))) throw new Error("IDEMPOTENCY_CONFLICT");
}