import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {hashOrganizationAccessCode} from "./access-code.js";
import {roleForNewOrganization,validateOrganizationDraft,type OrganizationDraft} from "./lifecycle.js";
export interface ProvisionOrganizationInput {id:string;slug:string;name:string;organizationType:OrganizationDraft["organizationType"];ownerUserId:string;accessCode:string;idempotencyKey:string;requestHash:string;createdAt:string;}
export class PostgresOrganizationProvisioningService {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async provision(input:ProvisionOrganizationInput):Promise<{organizationId:string;replayed:boolean}>{
    if(input.idempotencyKey.trim().length<16||input.idempotencyKey.length>256) throw new Error("ORG_IDEMPOTENCY_KEY_INVALID");
    const existing=await this.db.query("SELECT organization_id,request_hash FROM organization_provisioning_keys WHERE organization_id=$1 AND idempotency_key=$2",[input.id,input.idempotencyKey]);
    if(existing.rows[0]){if(existing.rows[0].request_hash!==input.requestHash) throw new Error("ORG_IDEMPOTENCY_CONFLICT");return {organizationId:input.id,replayed:true};}
    const accessCodeHash=hashOrganizationAccessCode(input.accessCode);
    const role=roleForNewOrganization(input.id,"director",randomUUID());
    validateOrganizationDraft({id:input.id,slug:input.slug,name:input.name,organizationType:input.organizationType,ownerUserId:input.ownerUserId,accessCodeHash});
    await this.db.query("BEGIN");
    try{
      await this.db.query("INSERT INTO organizations (id,slug,name,organization_type,owner_user_id,access_code_hash,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,'active',$7::timestamptz)",[input.id,input.slug,input.name,input.organizationType,input.ownerUserId,accessCodeHash,input.createdAt]);
      await this.db.query("INSERT INTO organization_roles (id,organization_id,code,name,permissions,version) VALUES ($1,$2,$3,$4,$5::jsonb,1)",[role.id,role.organizationId,role.code,"Directeur",JSON.stringify(role.permissions)]);
      await this.db.query("INSERT INTO organization_members (organization_id,user_id,role_id,status,joined_at) VALUES ($1,$2,$3,'active',$4::timestamptz)",[input.id,input.ownerUserId,role.id,input.createdAt]);
      await this.db.query("INSERT INTO organization_surfaces (organization_id,updated_at) VALUES ($1,$2::timestamptz)",[input.id,input.createdAt]);
      await this.db.query("INSERT INTO organization_provisioning_keys (organization_id,idempotency_key,request_hash,created_at) VALUES ($1,$2,$3,$4::timestamptz)",[input.id,input.idempotencyKey,input.requestHash,input.createdAt]);
      await this.db.query("COMMIT"); return {organizationId:input.id,replayed:false};
    }catch(error){await this.db.query("ROLLBACK");throw error;}
  }
}
