import {readFileSync} from "node:fs";
const web=readFileSync("apps/experience-web/design-contract.json");
const mobile=readFileSync("mobile/tpay_flutter/assets/design-contract.json");
if(!web.equals(mobile)) throw new Error("TPAY_DESIGN_CONTRACT_DRIFT");
const contract=JSON.parse(web.toString("utf8"));
if(contract.version!=="1.0.0"||!Array.isArray(contract.navigation)||contract.navigation.length!==18) throw new Error("TPAY_DESIGN_CONTRACT_INVALID");
process.stdout.write("T.Pay Web/Flutter design contract synchronized: "+contract.version+" ("+contract.navigation.length+" modules)\n");
