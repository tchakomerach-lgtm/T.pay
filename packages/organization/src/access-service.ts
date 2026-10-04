import {verifyOrganizationAccessCode} from "./access-code.js";

export interface AccessAttemptState {
  failedCount:number;
  lockedUntil?:string;
}

export interface OrganizationAccessAttemptRepository {
  getState(organizationId:string,userId:string):Promise<AccessAttemptState|undefined>;
  recordFailure(organizationId:string,userId:string,now:string,windowSeconds:number,maxFailures:number,lockSeconds:number):Promise<AccessAttemptState>;
  clear(organizationId:string,userId:string):Promise<void>;
}

export interface OrganizationAccessVerifier {
  verify(input:{organizationId:string;userId:string;accessCode:string;accessCodeHash:string;now?:string}):Promise<boolean>;
}

export class PolicyOrganizationAccessVerifier implements OrganizationAccessVerifier {
  constructor(
    private readonly attempts:OrganizationAccessAttemptRepository,
    private readonly policy={windowSeconds:300,maxFailures:5,lockSeconds:900}
  ){}

  async verify(input:{organizationId:string;userId:string;accessCode:string;accessCodeHash:string;now?:string}):Promise<boolean>{
    const now=input.now??new Date().toISOString();
    const state=await this.attempts.getState(input.organizationId,input.userId);
    if(state?.lockedUntil && state.lockedUntil>now) throw new Error("ORG_ACCESS_TEMPORARILY_LOCKED");
    const valid=verifyOrganizationAccessCode(input.accessCode,input.accessCodeHash);
    if(!valid){
      await this.attempts.recordFailure(input.organizationId,input.userId,now,this.policy.windowSeconds,this.policy.maxFailures,this.policy.lockSeconds);
      return false;
    }
    await this.attempts.clear(input.organizationId,input.userId);
    return true;
  }
}
