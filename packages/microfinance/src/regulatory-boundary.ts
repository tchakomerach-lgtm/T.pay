export type TPayFinancialRole="technology_provider"|"payment_initiation_partner"|"licensed_payment_service_provider"|"licensed_e_money_issuer";
export interface RegulatoryProfile{
 countryCode:string;
 tpayRole:TPayFinancialRole;
 authorizedForElectronicMoney:boolean;
 authorizedForPaymentServices:boolean;
}
export function assertRailUsageAllowed(profile:RegulatoryProfile,rail:"tmoney"|"flooz"|"pi_spi"|"partner_mfi"):void{
 if(profile.countryCode!=="TG")throw new Error("REGULATORY_COUNTRY_UNSUPPORTED");
 if(rail==="tmoney"||rail==="flooz"||rail==="pi_spi"){
  if(!profile.authorizedForPaymentServices && profile.tpayRole!=="technology_provider" && profile.tpayRole!=="payment_initiation_partner")
   throw new Error("PAYMENT_SERVICE_AUTHORIZATION_REQUIRED");
 }
 if(profile.tpayRole==="licensed_e_money_issuer" && !profile.authorizedForElectronicMoney)
   throw new Error("E_MONEY_AUTHORIZATION_REQUIRED");
}
export function assertTpayDoesNotIssueStoredValue(profile:RegulatoryProfile):void{
 if(profile.tpayRole!=="licensed_e_money_issuer" && profile.authorizedForElectronicMoney)
  throw new Error("REGULATORY_PROFILE_CONTRADICTION");
}
