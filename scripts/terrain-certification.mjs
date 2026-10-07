import {existsSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {request} from "node:https";

const required=["TPAY_TERRAIN_WEB_URL","TPAY_TERRAIN_API_URL","TPAY_TERRAIN_CA_FILE","TPAY_TERRAIN_APK_PATH"];
for(const name of required){
  if(!process.env[name]?.trim()) throw new Error("TPAY_TERRAIN_ENV_REQUIRED:"+name);
}
const webUrl=new URL(process.env.TPAY_TERRAIN_WEB_URL);
const apiUrl=new URL(process.env.TPAY_TERRAIN_API_URL);
if(webUrl.protocol!=="https:"||apiUrl.protocol!=="https:") throw new Error("TPAY_TERRAIN_HTTPS_ONLY");
if(["127.0.0.1","localhost","0.0.0.0"].includes(webUrl.hostname)) throw new Error("TPAY_TERRAIN_WEB_MUST_BE_LAN_REACHABLE");
if(!existsSync(process.env.TPAY_TERRAIN_CA_FILE)) throw new Error("TPAY_TERRAIN_CA_FILE_NOT_FOUND");
if(!existsSync(process.env.TPAY_TERRAIN_APK_PATH)) throw new Error("TPAY_TERRAIN_APK_NOT_FOUND");

function run(command,args,allowFailure=false){
  const r=spawnSync(command,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  if(r.status!==0&&!allowFailure) throw new Error(command+" "+args.join(" ")+"\n"+r.stderr);
  return r.stdout.trim();
}
function httpsGet(url,headers={}){
  return new Promise((resolve,reject)=>{
    const r=request(url,{method:"GET",headers,ca:readFileSync(process.env.TPAY_TERRAIN_CA_FILE),rejectUnauthorized:true},res=>{
      const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString("utf8")}));
    });
    r.on("error",reject);r.end();
  });
}

console.log("1/7 ADB");
const devices=run("adb",["devices"]);
if(!/^.+\tdevice$/m.test(devices)) throw new Error("TPAY_ANDROID_DEVICE_NOT_READY\n"+devices);
const apk=process.env.TPAY_TERRAIN_APK_PATH;
run("adb",["install","-r",apk]);
console.log("2/7 APK installed");

console.log("3/7 API HTTPS health");
for(const path of ["/health/live","/health/ready"]){
  const result=await httpsGet(new URL(path,apiUrl));
  if(result.status!==200) throw new Error("API_"+path+"_FAILED:"+result.status+" "+result.body);
}

console.log("4/7 authenticated session");
const token=process.env.TPAY_TERRAIN_ACCESS_TOKEN;
if(token){
  const result=await httpsGet(new URL("/v1/education/actors/current",apiUrl),{authorization:"Bearer "+token,accept:"application/json"});
  if(result.status!==200) throw new Error("SESSION_PERMISSION_FAILED:"+result.status+" "+result.body);
  console.log("authenticated actor endpoint: 200");
}else{
  console.log("access-token test skipped; provide TPAY_TERRAIN_ACCESS_TOKEN for session/permission verification");
}

console.log("5/7 SSE");
if(token){
  const result=await new Promise((resolve,reject)=>{
    const req=request(new URL("/v1/education/events/stream",apiUrl),{headers:{authorization:"Bearer "+token,accept:"text/event-stream"},ca:readFileSync(process.env.TPAY_TERRAIN_CA_FILE),rejectUnauthorized:true},res=>{
      let body="";
      const timer=setTimeout(()=>{res.destroy();resolve({status:res.statusCode??0,body});},5000);
      res.on("data",c=>{body+=c.toString();if(body.includes("event:")){clearTimeout(timer);res.destroy();resolve({status:res.statusCode??0,body});}});
      res.on("error",e=>{clearTimeout(timer);reject(e);});
    });
    req.on("error",reject);req.end();
  });
  if(result.status!==200) throw new Error("SSE_FAILED:"+result.status+" "+result.body);
  console.log("SSE HTTP 200");
}else{
  console.log("SSE skipped without token");
}

console.log("6/7 Android WebView");
run("adb",["logcat","-c"]);
run("adb",["shell","am","force-stop","com.tpay.os.debug"]);
run("adb",["shell","monkey","-p","com.tpay.os.debug","1"]);
await new Promise(r=>setTimeout(r,5000));
const log=run("adb",["logcat","-d","-s","TPAY_TERRAIN:I","*:S"]);
if(!log.includes("TPAY_WEB_LOADED:")) throw new Error("ANDROID_WEBVIEW_DID_NOT_LOAD\n"+log);
if(log.includes("TPAY_SSL_ERROR:")) throw new Error("ANDROID_SSL_ERROR\n"+log);
console.log(log);

console.log("7/7 certification boundary");
console.log("PASS: physical Android detected, APK installed, HTTPS API reachable, WebView loaded HTTPS without SSL error.");
console.log("MANUAL REQUIRED: toggle phone network off/on and verify SSE reconnect + Last-Event-ID/idempotent replay; this cannot be proven by static CI alone.");
