import type { PoolClient } from "pg";
import type { Organization, UUID } from "../../domain/src/types.js";
import type { OrganizationRepository } from "./service.js";

function assertOrgId(id:string): asserts id is UUID {
  if(!id) throw new Error("ORGANIZATION_ID_REQUIRED");
}

export class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: Pick<PoolClient,"query">) {}

  async insert(organization:Organization):Promise<void>{
    assertOrgId(organization.id);
    await this.db.query(
      "INSERT INTO organizations (id,slug,name,organization_type,owner_user_id,access_code_hash,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)",
      [organization.id, slugify(organization.name), organization.name, organization.type, organization.founderId, organization.accessCodeHash, organization.status, organization.createdAt]
    );
  }

  async findById(id:UUID):Promise<Organization|undefined>{
    const result=await this.db.query("SELECT id, name, organization_type, owner_user_id, access_code_hash, created_at, status FROM organizations WHERE id=$1",[id]);
    const row=result.rows[0];
    if(!row) return undefined;
    return {
      id:row.id as UUID,
      name:row.name,
      type:row.organization_type,
      founderId:row.owner_user_id as UUID,
      accessCodeHash:row.access_code_hash,
      createdAt:new Date(row.created_at).toISOString(),
      status:row.status==="archived"?"closed":row.status
    };
  }
}

function slugify(name:string):string {
  const slug=name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
  if(!slug) throw new Error("INVALID_ORGANIZATION_SLUG");
  return slug+"-"+crypto.randomUUID().slice(0,8);
}
