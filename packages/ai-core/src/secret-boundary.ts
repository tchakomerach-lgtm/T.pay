export interface SecretResolver {
  resolve(name:string):Promise<string|undefined>;
}

export function assertSecretName(name:string):void {
  if(!/^[A-Z][A-Z0-9_]{2,127}$/.test(name)) throw new Error("AI_SECRET_NAME_INVALID");
}

export async function requireSecret(resolver:SecretResolver,name:string):Promise<string>{
  assertSecretName(name);
  const value=await resolver.resolve(name);
  if(!value) throw new Error("AI_SECRET_NOT_CONFIGURED");
  return value;
}
