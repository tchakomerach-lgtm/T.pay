export type DomainEvent =
 | {type:"organization.created";organizationId:string;occurredAt:string}
 | {type:"member.role_assigned";organizationId:string;userId:string;roleId:string;occurredAt:string}
 | {type:"ledger.transaction_posted";transactionId:string;organizationId:string;occurredAt:string}
 | {type:"payment.initiated";paymentId:string;organizationId:string;occurredAt:string}
 | {type:"payment.completed";paymentId:string;organizationId:string;occurredAt:string}
 | {type:"payment.failed";paymentId:string;organizationId:string;reasonCode:string;occurredAt:string}
 | {type:"audit.security_event";actorId:string;action:string;resource:string;occurredAt:string};
export interface EventBus { publish(event:DomainEvent):Promise<void>; }