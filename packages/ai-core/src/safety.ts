export interface AiSafetyInput{prompt:string;organizationId?:string;dataClass:"public"|"internal"|"sensitive"|"financial";}
const injectionPatterns=[/ignore\s+(all|previous)\s+instructions/i,/reveal\s+(system|developer)\s+prompt/i,/disable\s+security/i,/bypass\s+approval/i];
export function detectPromptInjection(prompt:string):boolean{return injectionPatterns.some(p=>p.test(prompt));}
export function sanitizeAiRequest(input:AiSafetyInput){if(detectPromptInjection(input.prompt))throw new Error("AI_PROMPT_INJECTION_BLOCKED");if(input.dataClass==="financial"&&!input.organizationId)throw new Error("AI_FINANCIAL_SCOPE_REQUIRED");return {...input,prompt:input.prompt.trim().slice(0,12000)};}
export function assertToolResultBoundary(result:string,maxBytes=200_000){if(new TextEncoder().encode(result).byteLength>maxBytes)throw new Error("AI_TOOL_RESULT_TOO_LARGE");}
