export type SchoolWebSession={accessToken:string;expiresAt:string};
export type SchoolWebConfig={apiBaseUrl:string;session:SchoolWebSession;demo?:boolean};
export type SchoolWebEvent={id:string;event:string;data:unknown};
export type SchoolClass={
  class_id:string;academic_year:string;code:string;name:string;level:string;
  capacity:number;enrolled_count:number;status:"ACTIVE"|"ARCHIVED";version:number;created_at:string;updated_at:string;
};
export type SchoolEnrollment={
  enrollment_id:string;student_id:string;class_id:string;academic_year:string;
  status:"ACTIVE"|"WITHDRAWN"|"COMPLETED"|"CANCELLED";enrolled_at:string;version:number;
  class_code?:string;class_name?:string;
};
type ApiEnvelope<T>={ok:boolean;data?:T;error?:{code?:string;message?:string};replayed?:boolean};
async function readApiData<T>(response:Response):Promise<T>{
  let body:ApiEnvelope<T>;
  try{body=await response.json() as ApiEnvelope<T>;}catch{throw new Error("SCHOOL_API_INVALID_RESPONSE");}
  if(!response.ok||!body.ok)throw new Error(body.error?.code??`SCHOOL_API_HTTP_${response.status}`);
  if(body.data===undefined)throw new Error("SCHOOL_API_DATA_MISSING");
  return body.data;
};

function assertHttps(url:string):URL{const parsed=new URL(url);if(parsed.protocol!=="https:")throw new Error("WEB_HTTPS_REQUIRED");return parsed;}
function assertSession(session:SchoolWebSession){if(!session.accessToken)throw new Error("WEB_SESSION_REQUIRED");if(Date.parse(session.expiresAt)<=Date.now())throw new Error("WEB_SESSION_EXPIRED");}

export function createSchoolWebClient(config:SchoolWebConfig){
  const base=assertHttps(config.apiBaseUrl).toString().replace(/\/$/,"");
  return {
    async request(path:string,init:RequestInit={}):Promise<Response>{
      assertSession(config.session);
      const headers=new Headers(init.headers);
      headers.set("authorization",`Bearer ${config.session.accessToken}`);
      headers.set("accept","application/json");
      return fetch(assertHttps(base+path),{...init,headers,redirect:"error"});
    },
    async mutate(path:string,body:unknown):Promise<Response>{
      return this.request(path,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify(body)});
    },
    async listClasses(academicYear?:string):Promise<SchoolClass[]>{
      const query=academicYear?`?academicYear=${encodeURIComponent(academicYear)}`:"";
      return readApiData<SchoolClass[]>(await this.request(`/v1/education/classes${query}`));
    },
    async listEnrollments(classId?:string,academicYear?:string):Promise<SchoolEnrollment[]>{
      const query=new URLSearchParams();
      if(classId)query.set("classId",classId);
      if(academicYear)query.set("academicYear",academicYear);
      const suffix=query.size?`?${query.toString()}`:"";
      return readApiData<SchoolEnrollment[]>(await this.request(`/v1/education/enrollments${suffix}`));
    },
    async createClass(input:{academicYear:string;code:string;name:string;level:string;capacity:number}):Promise<SchoolClass>{
      return readApiData<SchoolClass>(await this.mutate("/v1/education/classes",input));
    },
    async createEnrollment(input:{studentId:string;classId:string;academicYear:string}):Promise<SchoolEnrollment>{
      return readApiData<SchoolEnrollment>(await this.mutate("/v1/education/enrollments",input));
    },
    async transitionEnrollment(enrollmentId:string,input:{status:"WITHDRAWN"|"CANCELLED"|"COMPLETED";expectedVersion:number}):Promise<SchoolEnrollment>{
      if(!enrollmentId||enrollmentId.length>128)throw new Error("SCHOOL_ENROLLMENT_ID_INVALID");
      const response=await this.request("/v1/education/enrollments/"+encodeURIComponent(enrollmentId),{
        method:"PATCH",
        headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},
        body:JSON.stringify(input)
      });
      return readApiData<SchoolEnrollment>(response);
    }
  };
}

export async function consumeSchoolSse(config:SchoolWebConfig,onEvent:(event:SchoolWebEvent)=>void,signal:AbortSignal):Promise<void>{
  const client=createSchoolWebClient(config);
  const lastEventId=sessionStorage.getItem("tpay-school-last-event-id");
  const headers=new Headers({accept:"text/event-stream"});
  if(lastEventId)headers.set("last-event-id",lastEventId);
  const response=await client.request("/v1/education/events/stream",{headers,signal});
  if(!response.ok||!response.body)throw new Error(`WEB_REALTIME_HTTP_${response.status}`);
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="";
  while(true){
    const {done,value}=await reader.read();if(done)break;
    buffer+=decoder.decode(value,{stream:true});const frames=buffer.split("\n\n");buffer=frames.pop()??"";
    for(const frame of frames){
      const id=frame.match(/^id:\s*(.+)$/m)?.[1]?.trim();const event=frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();const data=frame.match(/^data:\s*(.+)$/m)?.[1]?.trim();
      if(!id||!event||!data)continue;sessionStorage.setItem("tpay-school-last-event-id",id);onEvent({id,event,data:JSON.parse(data)});
    }
  }
}
