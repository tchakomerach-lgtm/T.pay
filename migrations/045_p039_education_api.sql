-- P039 School OS API domain persistence.
CREATE TABLE IF NOT EXISTS education_actors (
  actor_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  kind text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_education_actors_org ON education_actors(tenant_id,organization_id);

CREATE TABLE IF NOT EXISTS education_students (
  student_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  lifecycle text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_education_students_org ON education_students(tenant_id,organization_id);

CREATE TABLE IF NOT EXISTS education_work_items (
  work_item_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  status text NOT NULL,
  priority text NOT NULL,
  due_at timestamptz,
  owner_actor_id text,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_education_work_items_org_status ON education_work_items(tenant_id,organization_id,status);

CREATE TABLE IF NOT EXISTS education_attendance (
  student_id text NOT NULL,
  class_id text NOT NULL,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  status text NOT NULL,
  recorded_by text NOT NULL,
  occurred_at timestamptz NOT NULL,
  source text NOT NULL,
  correction_reason text,
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,organization_id,student_id,class_id)
);

CREATE TABLE IF NOT EXISTS education_service_requests (
  request_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  requester_id text NOT NULL,
  service_code text NOT NULL,
  status text NOT NULL,
  priority text NOT NULL,
  assigned_to text,
  created_at timestamptz NOT NULL,
  due_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_education_service_org_status ON education_service_requests(tenant_id,organization_id,status);

ALTER TABLE education_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_service_requests ENABLE ROW LEVEL SECURITY;
