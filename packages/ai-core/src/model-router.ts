export type AiProvider="openai"|"anthropic"|"local";
export interface ModelRoute {provider:AiProvider;model:string;purpose:"reasoning"|"fast"|"embedding"|"safety";maxInputTokens:number;}
export interface RoutePolicy {allowAnthropic:boolean;allowExternal:boolean;dataClass:"public"|"internal"|"sensitive"|"financial";}
export function routeModel(p:RoutePolicy):ModelRoute{if(p.dataClass==="financial"||p.dataClass==="sensitive")return {provider:"local",model:"tpay-safe-router",purpose:"reasoning",maxInputTokens:32000};if(p.allowAnthropic)return {provider:"anthropic",model:"claude",purpose:"reasoning",maxInputTokens:32000};return {provider:"openai",model:"gpt",purpose:"reasoning",maxInputTokens:32000};}
