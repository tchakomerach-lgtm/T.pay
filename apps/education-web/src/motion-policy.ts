export type MotionCapability={
  reducedMotion:boolean;
  saveData:boolean;
  deviceMemory?:number;
  hardwareConcurrency?:number;
};

/**
 * UI motion is progressive enhancement. Preserve the static UI on reduced-motion,
 * data-saver, and constrained devices. Unknown capability values do not block motion.
 */
export function shouldAnimateUi(capability:MotionCapability):boolean{
  if(capability.reducedMotion||capability.saveData)return false;
  if(typeof capability.deviceMemory==="number"&&capability.deviceMemory>0&&capability.deviceMemory<=2)return false;
  if(typeof capability.hardwareConcurrency==="number"&&capability.hardwareConcurrency>0&&capability.hardwareConcurrency<=2)return false;
  return true;
}
