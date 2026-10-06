import React,{useEffect,useMemo,useState} from "react";
import {Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {StatusBar} from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import {TPayApi,type Health,type Organization,type OrganizationDetail} from "./api";

const API_URL=process.env.EXPO_PUBLIC_TPAY_API_URL ?? "https://api.tpay.tg";
const api=new TPayApi(API_URL);
const screens=[["home","Accueil"],["organizations","Organisations"],["social","Réseau social"],["opportunities","Opportunités"],["tontine","Tontine communautaire"]] as const;
type Screen=typeof screens[number][0];

export default function App(){
 const [screen,setScreen]=useState<Screen>("home"),[health,setHealth]=useState<Health|null>(null),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[signedIn,setSignedIn]=useState(false),[organizations,setOrganizations]=useState<Organization[]>([]),[orgName,setOrgName]=useState(""),[orgType,setOrgType]=useState("Entreprise"),[orgAccessCode,setOrgAccessCode]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[selectedOrganizationId,setSelectedOrganizationId]=useState<string|null>(null),[selectedOrganization,setSelectedOrganization]=useState<OrganizationDetail|null>(null),[portalCode,setPortalCode]=useState("");
 useEffect(()=>{void api.health().then(setHealth).catch(e=>setMessage(String(e.message)));},[]);
 useEffect(()=>{
  if(Platform.OS==="web"){
    const csrf=typeof sessionStorage!=="undefined"?sessionStorage.getItem("tpay.session.csrf"):null;
    if(csrf)api.setSession(undefined,csrf);
    void api.me().then(profile=>{api.setSession(undefined,api.getSessionToken(),profile.userId);setSignedIn(true)}).catch(()=>setSignedIn(false));
    return;
  }
  void (async()=>{
    const token=await SecureStore.getItemAsync("tpay.session.token");
    const csrf=await SecureStore.getItemAsync("tpay.session.csrf");
    if(!token){setSignedIn(false);return;}
    api.setSession(token,csrf??undefined);
    try{const profile=await api.me();api.setSession(token,csrf??undefined,profile.userId);setSignedIn(true);}catch{api.clearSession();await SecureStore.deleteItemAsync("tpay.session.token");await SecureStore.deleteItemAsync("tpay.session.csrf");setSignedIn(false);}
  })();
},[]);
 useEffect(()=>{if(!signedIn)return;void api.organizations().then(page=>setOrganizations(page.items)).catch(()=>setOrganizations([]));},[signedIn]);
 useEffect(()=>{
  if(!signedIn)return;
  const sync=()=>{void api.sync().then(()=>api.organizations()).then(page=>setOrganizations(page.items)).then(()=>api.flushTelemetry()).catch(()=>undefined);};
  sync();
  const timer=setInterval(sync,15000);
  if(Platform.OS==="web"&&typeof window!=="undefined")window.addEventListener("online",sync);
  return()=>{clearInterval(timer);if(Platform.OS==="web"&&typeof window!=="undefined")window.removeEventListener("online",sync);};
 },[signedIn]);
 const title=useMemo(()=>screens.find(x=>x[0]===screen)?.[1]??"T.Pay",[screen]);
 async function login(){setBusy(true);setMessage("");try{const result=await api.login({loginIdentifier:email,password});setSignedIn(true);if(Platform.OS!=="web"&&result.sessionToken){await SecureStore.setItemAsync("tpay.session.token",result.sessionToken);await SecureStore.setItemAsync("tpay.session.csrf",result.csrfToken);}
   if(Platform.OS==="web"&&typeof sessionStorage!=="undefined")sessionStorage.setItem("tpay.session.csrf",result.csrfToken);setMessage("Session sécurisée ouverte.");}catch(e){setMessage(e instanceof Error?e.message:"AUTHENTICATION_FAILED");}finally{setBusy(false);}}
 async function createOrganization(){
  if(!orgName.trim()||orgAccessCode.length<8){setMessage("Nom et code organisation valides requis (code: 8 caractères minimum).");return;}
  setBusy(true);setMessage("");
  try{const result=await api.createOrganization({name:orgName.trim(),type:orgType,accessCode:orgAccessCode});setOrgName("");setOrgAccessCode("");setMessage("Organisation créée: "+result.organizationId);const page=await api.organizations();setOrganizations(page.items);}
  catch(e){setMessage(e instanceof Error?e.message:"ORGANIZATION_CREATION_FAILED");}
  finally{setBusy(false);}
 }
 async function logout(){setBusy(true);try{await api.logout();setSignedIn(false);if(Platform.OS!=="web"){await SecureStore.deleteItemAsync("tpay.session.token");await SecureStore.deleteItemAsync("tpay.session.csrf");}
   if(Platform.OS==="web"&&typeof sessionStorage!=="undefined")sessionStorage.removeItem("tpay.session.csrf");setMessage("Session terminée.");}catch(e){setMessage(e instanceof Error?e.message:"LOGOUT_FAILED");}finally{setBusy(false);}}
 return <View style={styles.root}><StatusBar style="dark"/>
  <View style={styles.header}><Text style={styles.logo}>↑ T<Text style={styles.logoAccent}>.pay</Text></Text><Text style={styles.health}>{health?.ready?"● Core connecté":"● Core hors ligne"}</Text></View>
  <View style={styles.body}><View style={styles.nav}>{screens.map(([id,label])=><Pressable key={id} onPress={()=>setScreen(id)} style={[styles.navItem,screen===id&&styles.navActive]}><Text style={[styles.navText,screen===id&&styles.navTextActive]}>{label}</Text></Pressable>)}</View>
   <ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>T.PAY OS · UNIVERSAL</Text><Text style={styles.title}>{title}</Text><Text style={styles.description}>Interface React Native universelle Android, iOS et Web partageant les contrats API et composants métier.</Text>
   {!signedIn?<View style={styles.card}><Text style={styles.cardTitle}>Connexion serveur</Text><TextInput autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Identifiant" style={styles.input}/><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Mot de passe" style={styles.input}/><Pressable disabled={busy} onPress={()=>void login()} style={styles.primary}><Text style={styles.primaryText}>{busy?"Connexion…":"Se connecter"}</Text></Pressable></View>:<View style={styles.card}><Text style={styles.cardTitle}>Session active</Text><Text style={styles.muted}>L'identité est contrôlée côté serveur. Le client ne conserve pas le token web dans localStorage.</Text><Pressable disabled={busy} onPress={()=>void logout()} style={styles.secondary}><Text style={styles.secondaryText}>Se déconnecter</Text></Pressable></View>}
   {message?<Text accessibilityRole="alert" style={styles.message}>{message}</Text>:null}
   {screen==="organizations"?<><View style={styles.card}><Text style={styles.cardTitle}>Créer une organisation</Text><TextInput value={orgName} onChangeText={setOrgName} placeholder="Nom de l'organisation" style={styles.input}/><TextInput value={orgType} onChangeText={setOrgType} placeholder="Type" style={styles.input}/><TextInput secureTextEntry value={orgAccessCode} onChangeText={setOrgAccessCode} placeholder="Code portail organisation (8+ caractères)" style={styles.input}/><Pressable disabled={busy||!signedIn} onPress={()=>void createOrganization()} style={styles.primary}><Text style={styles.primaryText}>{busy?"Création…":"Créer l'organisation"}</Text></Pressable></View><View style={styles.card}><Text style={styles.cardTitle}>Organisations persistantes</Text>{signedIn?organizations.length?organizations.map(org=><Pressable key={org.id} onPress={()=>void (async()=>{setSelectedOrganizationId(org.id);try{setSelectedOrganization(await api.organization(org.id));}catch(e){setMessage(e instanceof Error?e.message:"ORGANIZATION_LOAD_FAILED");}})()} style={styles.orgRow}><Text style={styles.orgName}>{org.name}</Text><Text style={styles.muted}>{org.type} · {org.roleName}</Text></Pressable>):<Text style={styles.muted}>Aucune organisation active pour cette session.</Text>:<Text style={styles.muted}>Connectez-vous pour charger vos organisations.</Text>}</View>
   {selectedOrganization&&selectedOrganizationId?<View style={styles.card}><Text style={styles.cardTitle}>{selectedOrganization.name}</Text><Text style={styles.muted}>Type: {selectedOrganization.type} · Rôle: {selectedOrganization.roleName}</Text><Text style={styles.muted}>Permissions: {selectedOrganization.permissions.join(", ")}</Text><Pressable disabled={busy} onPress={()=>void (async()=>{try{await api.openOrganizationSession(selectedOrganization.id,orgAccessCode);setMessage("Session organisationnelle ouverte.");}catch(e){setMessage(e instanceof Error?e.message:"ORGANIZATION_SESSION_FAILED");}})()} style={styles.primary}><Text style={styles.primaryText}>Ouvrir la session organisationnelle</Text></Pressable><TextInput secureTextEntry value={portalCode} onChangeText={setPortalCode} placeholder="Code portail membre" style={styles.input}/><Pressable disabled={busy||!portalCode} onPress={()=>void (async()=>{try{await api.openPortalSession(selectedOrganization.id,portalCode);setPortalCode("");setMessage("Portail organisationnel ouvert.");}catch(e){setMessage(e instanceof Error?e.message:"PORTAL_SESSION_FAILED");}})()} style={styles.secondary}><Text style={styles.secondaryText}>Entrer avec le code portail</Text></Pressable><Text style={styles.muted}>Le portail charge ses membres et permissions depuis PostgreSQL; aucune donnée de démonstration n'est utilisée.</Text></View>:null}</>:null}
   <View style={styles.card}><Text style={styles.cardTitle}>Scalabilité</Text><Text style={styles.muted}>Aucune logique financière critique dans le client. Pagination, autorisation, idempotence et ledger restent côté serveur.</Text></View>
   </ScrollView></View></View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#f4f7f5"},header:{height:70,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:24,backgroundColor:"#fff",borderBottomWidth:1,borderBottomColor:"#e1e9e4"},logo:{fontSize:24,fontWeight:"800",color:"#173a2a"},logoAccent:{color:"#20a865"},health:{fontSize:12,color:"#25764e"},body:{flex:1,flexDirection:"row"},nav:{width:230,padding:18,gap:6,backgroundColor:"#0d2118"},navItem:{padding:12,borderRadius:10},navActive:{backgroundColor:"#1d5d40"},navText:{color:"#9eb8aa",fontWeight:"600"},navTextActive:{color:"#fff"},content:{width:"100%",maxWidth:920,alignSelf:"center",padding:30,gap:16},eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.4,color:"#258257"},title:{fontSize:38,fontWeight:"800",color:"#10261b"},description:{fontSize:16,lineHeight:25,color:"#66776e",maxWidth:720},card:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e0e8e3",borderRadius:16,padding:22,gap:12,marginTop:10},cardTitle:{fontSize:19,fontWeight:"800",color:"#183629"},muted:{color:"#687970",lineHeight:21},input:{borderWidth:1,borderColor:"#d7e2dc",borderRadius:10,padding:13,fontSize:15,backgroundColor:"#fff"},primary:{backgroundColor:"#15965a",borderRadius:10,padding:14,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"800"},secondary:{borderWidth:1,borderColor:"#d7e2dc",borderRadius:10,padding:13,alignItems:"center"},secondaryText:{color:"#1e3c2e",fontWeight:"800"},message:{padding:12,borderRadius:10,backgroundColor:"#fff5df",color:"#6b4d16"},orgRow:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#edf2ef"},orgName:{fontSize:16,fontWeight:"800",color:"#183629"}});