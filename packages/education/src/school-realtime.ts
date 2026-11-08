export type SchoolRealtimeEvent={
 id:string; tenantId:string; organizationId:string; type:"student.changed"|"subject.changed"|"class.changed"|"enrollment.changed"|"class_assignment.changed"|"attendance.changed"|"work_item.changed"|"service_request.changed"|"sync.accepted"|"sync.pending"|"assessment.changed"|"grade.changed";
 occurredAt:string; entityId:string; version:number; data:Record<string,unknown>; streamSequence?:string;
};
export type SchoolRealtimeMessage={kind:"event";event:SchoolRealtimeEvent}|{kind:"resync_required";reason:"QUEUE_OVERFLOW"|"CURSOR_EXPIRED";lastEventId:string|null};
export type SchoolSubscriber={id:string;tenantId:string;organizationId:string;send(message:SchoolRealtimeMessage):void;close():void};
export class SchoolRealtimeHub{
 private subscribers=new Map<string,SchoolSubscriber>();
 private publishedIds=new Set<string>();
 private readonly maxRememberedEvents=10000;
 private readonly maxQueue:number;
 private readonly queues=new Map<string,number>();
 constructor(maxQueue=100){if(maxQueue<1)throw new Error("REALTIME_INVALID_QUEUE_LIMIT");this.maxQueue=maxQueue;}
 ack(subscriberId:string):void{ const depth=this.queues.get(subscriberId); if(depth!==undefined)this.queues.set(subscriberId,Math.max(0,depth-1)); }
 subscribe(subscriber:SchoolSubscriber):()=>void{
  if(this.subscribers.has(subscriber.id))throw new Error("REALTIME_DUPLICATE_SUBSCRIBER");
  this.subscribers.set(subscriber.id,subscriber);this.queues.set(subscriber.id,0);
  return ()=>{this.subscribers.delete(subscriber.id);this.queues.delete(subscriber.id);};
 }
 publish(event:SchoolRealtimeEvent):void{
  if(this.publishedIds.has(event.id))return;
  this.publishedIds.add(event.id);
  if(this.publishedIds.size>this.maxRememberedEvents){
   const oldest=this.publishedIds.values().next().value;
   if(oldest)this.publishedIds.delete(oldest);
  }
  for(const [id,sub] of this.subscribers){
   if(sub.tenantId!==event.tenantId||sub.organizationId!==event.organizationId)continue;
   try{
    const depth=(this.queues.get(id)??0)+1;
    if(depth>this.maxQueue){
     try{sub.send({kind:"resync_required",reason:"QUEUE_OVERFLOW",lastEventId:event.id});}catch{/* close below */}
     try{sub.close();}catch{/* subscriber is already unusable */}
     this.subscribers.delete(id);this.queues.delete(id);continue;
    }
    this.queues.set(id,depth);sub.send({kind:"event",event});
   }catch{
    try{sub.close();}catch{/* subscriber is already unusable */}
    this.subscribers.delete(id);this.queues.delete(id);
   }
  }
 }
}
export function toSseMessage(message:SchoolRealtimeMessage):string{
 return `id: ${message.kind==="event"?(message.event.streamSequence??message.event.id):"resync"}\nevent: ${message.kind}\ndata: ${JSON.stringify(message)}\n\n`;
}
