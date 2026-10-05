import {createHash} from "node:crypto";
import {assertHttpsOrigin} from "./auth-device.js";
import type {ApiChannel} from "./rate-policy.js";

export const CHANNELS:readonly ApiChannel[]=["web","mobile","agent","ussd","sms","voice","partner"];
export const MAX_INGRESS_BYTES=64*1024;
const HEX64=/^[a-f0-9]{64}$/;

export interface ChannelIngressInput{
  channel:ApiChannel;
  method:string;
  route:string;
  origin:string;
  correlationId:string;
  idempotencyKey:string;
  scopeSecret:string;
  payload:string|Uint8Array;
  sequenceNo?:string|bigint;
  offline?:boolean;
}

export interface CanonicalChannelIngress{
  channel:ApiChannel;
  method:string;
  route:string;
  origin:string;
  correlationId:string;
  idempotencyKey:string;
  scopeHash:string;
  payloadHash:string;
  payloadBytes:number;
  sequenceNo?:string;
  offline:boolean;
}

function sha256(data:string|Uint8Array):string{
  return createHash("sha256").update(data).digest("hex");
}

export function normalizeChannelIngress(input:ChannelIngressInput):CanonicalChannelIngress{
  assertHttpsOrigin(input.origin);
  if(!CHANNELS.includes(input.channel))throw new Error("CHANNEL_INVALID");
  const method=input.method.toUpperCase();
  if(!/^[A-Z]{3,10}$/.test(method))throw new Error("CHANNEL_METHOD_INVALID");
  if(!input.route.startsWith("/")||input.route.length>240)throw new Error("CHANNEL_ROUTE_INVALID");
  if(input.correlationId.length<8||input.correlationId.length>200)throw new Error("CHANNEL_CORRELATION_INVALID");
  if(input.idempotencyKey.length<8||input.idempotencyKey.length>200)throw new Error("CHANNEL_IDEMPOTENCY_INVALID");
  if(input.scopeSecret.length<8||input.scopeSecret.length>512)throw new Error("CHANNEL_SCOPE_INVALID");
  const bytes=typeof input.payload==="string"?Buffer.byteLength(input.payload,"utf8"):input.payload.byteLength;
  if(bytes<0||bytes>MAX_INGRESS_BYTES)throw new Error("CHANNEL_PAYLOAD_TOO_LARGE");
  let sequenceNo:string|undefined;
  if(input.sequenceNo!==undefined){
    try{
      const value=typeof input.sequenceNo==="bigint"?input.sequenceNo:BigInt(input.sequenceNo);
      if(value<0n||value>9223372036854775807n)throw new Error();
      sequenceNo=value.toString();
    }catch{throw new Error("CHANNEL_SEQUENCE_INVALID");}
  }
  const result:CanonicalChannelIngress={
    channel:input.channel,method,route:input.route,origin:input.origin,
    correlationId:input.correlationId,idempotencyKey:input.idempotencyKey,
    scopeHash:sha256(input.scopeSecret),payloadHash:sha256(input.payload),
    payloadBytes:bytes,offline:input.offline===true
  };
  if(sequenceNo!==undefined)result.sequenceNo=sequenceNo;
  return result;
}

export function assertPayloadHash(value:string):void{
  if(!HEX64.test(value))throw new Error("CHANNEL_PAYLOAD_HASH_INVALID");
}
