import type { PoolClient } from "pg";
import type { OrganizationMember, OrganizationRole } from "./access-control.js";

export interface OrganizationMembershipRepository {
  insertRole(role:OrganizationRole):Promise<void>;
  insertMember(member:OrganizationMember):Promise<void>;
  setMemberStatus(organizationId:string,userId:string,status:OrganizationMember["status"]):Promise<boolean>;
  findMember(organizationId:string,userId:string):Promise<OrganizationMember|undefined>;
  findRole(organizationId:string,roleId:string):Promise<OrganizationRole|undefined>;
}

export class PostgresOrganizationMembershipRepository implements OrganizationMembershipRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}

  async insertRole(role:OrganizationRole):Promise<void>{
    await this.db.query(
      "INSERT INTO organization_roles (id,organization_id,code,name,permissions,version) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
      [role.id,role.organizationId,role.code,role.code,JSON.stringify(role.permissions),role.version]
    );
  }

  async insertMember(member:OrganizationMember):Promise<void>{
    await this.db.query(
      "INSERT INTO organization_members (organization_id,user_id,role_id,status,joined_at) VALUES ($1,$2,$3,$4,CASE WHEN $4='active' THEN now() ELSE NULL END)",
      [member.organizationId,member.userId,member.roleId,member.status]
    );
  }

  async setMemberStatus(organizationId:string,userId:string,status:OrganizationMember["status"]):Promise<boolean>{
    const result=await this.db.query(
      "UPDATE organization_members SET status=$3, joined_at=CASE WHEN $3='active' AND joined_at IS NULL THEN now() ELSE joined_at END WHERE organization_id=$1 AND user_id=$2",
      [organizationId,userId,status]
    );
    return Number(result.rowCount??0)===1;
  }

  async findMember(organizationId:string,userId:string):Promise<OrganizationMember|undefined>{
    const result=await this.db.query(
      "SELECT organization_id,user_id,role_id,status FROM organization_members WHERE organization_id=$1 AND user_id=$2",
      [organizationId,userId]
    );
    const row=result.rows[0]; if(!row) return undefined;
    return {organizationId:row.organization_id,userId:row.user_id,roleId:row.role_id,status:row.status};
  }

  async findRole(organizationId:string,roleId:string):Promise<OrganizationRole|undefined>{
    const result=await this.db.query(
      "SELECT id,organization_id,code,permissions,version FROM organization_roles WHERE organization_id=$1 AND id=$2",
      [organizationId,roleId]
    );
    const row=result.rows[0]; if(!row) return undefined;
    return {id:row.id,organizationId:row.organization_id,code:row.code,permissions:Array.isArray(row.permissions)?row.permissions:[],version:Number(row.version)};
  }
}
