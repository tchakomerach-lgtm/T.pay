export type WalletStatus="active"|"frozen"|"closed";
export interface Wallet { id:string; ownerId:string; organizationId?:string; currency:string; status:WalletStatus; }
export interface WalletBalance { walletId:string; currency:string; availableMinor:bigint; heldMinor:bigint; }

export function availableBalance(b:WalletBalance):bigint{
  if(b.availableMinor<0n||b.heldMinor<0n) throw new Error("INVALID_BALANCE");
  return b.availableMinor;
}
export function assertWalletCanTransact(wallet:Wallet):void{
  if(wallet.status!=="active") throw new Error("WALLET_NOT_ACTIVE");
}