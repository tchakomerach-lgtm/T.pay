export type SchoolWebSession={accessToken:string;expiresAt:string};
export type SchoolWebConfig={apiBaseUrl:string;session:SchoolWebSession;demo?:boolean};
export type SchoolWebEvent={id:string;event:string;data:unknown};

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
