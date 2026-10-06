import React,{useEffect,useMemo,useState} from "react";
import {Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {StatusBar} from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import {TPayApi,type Health} from "./api";

const API_URL=process.env.EXPO_PUBLIC_TPAY_API_URL ?? "https://api.tpay.tg";
const api=new TPayApi(API_URL);
const screens=[["home","Accueil"],["organizations","Organisations"],["social","Réseau social"],["opportunities","Opportunités"],["tontine","Tontine communautaire"]] as const;
type Screen=typeof screens[number][0];

export default function App(){
 const [screen,setScreen]=useState<Screen>("home"),[health,setHealth]=useState<Health|null>(null),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[signedIn,setSignedIn]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{void api.health().then(setHealth).catch(e=>setMessage(String(e.message)));},[]);
 useEffect(()=>{
  if(Platform.OS==="web"){
    const csrf=typeof sessionStorage!=="undefined"?sessionStorage.getItem("tpay.session.csrf"):null;
    if(csrf)api.setSession(undefined,csrf);
    void api.me().then(()=>setSignedIn(true)).catch(()=>setSignedIn(false));
    return;
  }
  void (async()=>{
    const token=await SecureStore.getItemAsync("tpay.session.token");
    const csrf=await SecureStore.getItemAsync("tpay.session.csrf");
    if(!token){setSignedIn(false);return;}
    api.setSession(token,csrf??undefined);
    try{await api.me();setSignedIn(true);}catch{api.clearSession();await SecureStore.deleteItemAsync("tpay.session.token");await SecureStore.deleteItemAsync("tpay.session.csrf");setSignedIn(false);}
  })();
},[]);
 const title=useMemo(()=>screens.find(x=>x[0]===screen)?.[1]??"T.Pay",[screen]);
 async function login(){setBusy(true);setMessage("");try{const result=await api.login({loginIdentifier:email,password});setSignedIn(true);if(Platform.OS!=="web"&&result.sessionToken){await SecureStore.setItemAsync("tpay.session.token",result.sessionToken);await SecureStore.setItemAsync("tpay.session.csrf",result.csrfToken);}
   if(Platform.OS==="web"&&typeof sessionStorage!=="undefined")sessionStorage.setItem("tpay.session.csrf",result.csrfToken);setMessage("Session sécurisée ouverte.");}catch(e){setMessage(e instanceof Error?e.message:"AUTHENTICATION_FAILED");}finally{setBusy(false);}}
 async function logout(){setBusy(true);try{await api.logout();setSignedIn(false);if(Platform.OS!=="web"){await SecureStore.deleteItemAsync("tpay.session.token");await SecureStore.deleteItemAsync("tpay.session.csrf");}
   if(Platform.OS==="web"&&typeof sessionStorage!=="undefined")sessionStorage.removeItem("tpay.session.csrf");setMessage("Session terminée.");}catch(e){setMessage(e instanceof Error?e.message:"LOGOUT_FAILED");}finally{setBusy(false);}}
 return <View style={styles.root}><StatusBar style="dark"/>
  <View style={styles.header}><Text style={styles.logo}>↑ T<Text style={styles.logoAccent}>.pay</Text></Text><Text style={styles.health}>{health?.ready?"● Core connecté":"● Core hors ligne"}</Text></View>
  <View style={styles.body}><View style={styles.nav}>{screens.map(([id,label])=><Pressable key={id} onPress={()=>setScreen(id)} style={[styles.navItem,screen===id&&styles.navActive]}><Text style={[styles.navText,screen===id&&styles.navTextActive]}>{label}</Text></Pressable>)}</View>
   <ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>T.PAY OS · UNIVERSAL</Text><Text style={styles.title}>{title}</Text><Text style={styles.description}>Interface React Native universelle Android, iOS et Web partageant les contrats API et composants métier.</Text>
   {!signedIn?<View style={styles.card}><Text style={styles.cardTitle}>Connexion serveur</Text><TextInput autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Identifiant" style={styles.input}/><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Mot de passe" style={styles.input}/><Pressable disabled={busy} onPress={()=>void login()} style={styles.primary}><Text style={styles.primaryText}>{busy?"Connexion…":"Se connecter"}</Text></Pressable></View>:<View style={styles.card}><Text style={styles.cardTitle}>Session active</Text><Text style={styles.muted}>L'identité est contrôlée côté serveur. Le client ne conserve pas le token web dans localStorage.</Text><Pressable disabled={busy} onPress={()=>void logout()} style={styles.secondary}><Text style={styles.secondaryText}>Se déconnecter</Text></Pressable></View>}
   {message?<Text accessibilityRole="alert" style={styles.message}>{message}</Text>:null}<View style={styles.card}><Text style={styles.cardTitle}>Scalabilité</Text><Text style={styles.muted}>Aucune logique financière critique dans le client. Pagination, autorisation, idempotence et ledger restent côté serveur.</Text></View>
   </ScrollView></View></View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#f4f7f5"},header:{height:70,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:24,backgroundColor:"#fff",borderBottomWidth:1,borderBottomColor:"#e1e9e4"},logo:{fontSize:24,fontWeight:"800",color:"#173a2a"},logoAccent:{color:"#20a865"},health:{fontSize:12,color:"#25764e"},body:{flex:1,flexDirection:"row"},nav:{width:230,padding:18,gap:6,backgroundColor:"#0d2118"},navItem:{padding:12,borderRadius:10},navActive:{backgroundColor:"#1d5d40"},navText:{color:"#9eb8aa",fontWeight:"600"},navTextActive:{color:"#fff"},content:{width:"100%",maxWidth:920,alignSelf:"center",padding:30,gap:16},eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.4,color:"#258257"},title:{fontSize:38,fontWeight:"800",color:"#10261b"},description:{fontSize:16,lineHeight:25,color:"#66776e",maxWidth:720},card:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e0e8e3",borderRadius:16,padding:22,gap:12,marginTop:10},cardTitle:{fontSize:19,fontWeight:"800",color:"#183629"},muted:{color:"#687970",lineHeight:21},input:{borderWidth:1,borderColor:"#d7e2dc",borderRadius:10,padding:13,fontSize:15,backgroundColor:"#fff"},primary:{backgroundColor:"#15965a",borderRadius:10,padding:14,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"800"},secondary:{borderWidth:1,borderColor:"#d7e2dc",borderRadius:10,padding:13,alignItems:"center"},secondaryText:{color:"#1e3c2e",fontWeight:"800"},message:{padding:12,borderRadius:10,backgroundColor:"#fff5df",color:"#6b4d16"}});