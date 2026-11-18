import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'api/tpay_api_client.dart';
import 'api/pending_idempotency_keys.dart';

const _protectionGreen=Color(0xff0f8f68);
const _protectionInk=Color(0xff16352c);
const _protectionTiers=<Map<String,Object>>[
  {'tier':'ESSENTIEL','rate':1,'covered':1,'grace':7,'waiting':14,'cap':'10000000'},
  {'tier':'EQUILIBRE','rate':2,'covered':2,'grace':14,'waiting':14,'cap':'20000000'},
  {'tier':'RENFORCE','rate':3,'covered':3,'grace':21,'waiting':30,'cap':'30000000'},
];

class CommunityTontineProtectionScreen extends StatefulWidget {
  const CommunityTontineProtectionScreen({super.key,required this.apiClient,required this.groupId});
  final TPayApiClient apiClient;
  final String groupId;
  @override
  State<CommunityTontineProtectionScreen> createState()=>_CommunityTontineProtectionScreenState();
}

class _CommunityTontineProtectionScreenState extends State<CommunityTontineProtectionScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _entry=AnimationController(vsync:this,duration:const Duration(milliseconds:420))..forward();
  late final PendingIdempotencyKeys _pending=PendingIdempotencyKeys(_key);
  List<Map<String,dynamic>> _policies=[];
  bool _loading=false;
  bool _busy=false;
  String? _error;
  String? _notice;
  String _key()=>'ct042-${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1<<32)}';

  @override
  void initState(){super.initState();_load();}
  @override
  void dispose(){_entry.dispose();super.dispose();}

  Future<Map<String,dynamic>> _read(String path) async {
    final response=await widget.apiClient.get(path);
    final raw=await response.transform(utf8.decoder).join();
    final decoded=jsonDecode(raw) as Map<String,dynamic>;
    if(response.statusCode<200||response.statusCode>=300){
      final err=decoded['error'];
      throw StateError(err is Map?' ${err['code']??'TONTINE_PROTECTION_HTTP_${response.statusCode}'}':'TONTINE_PROTECTION_HTTP_${response.statusCode}');
    }
    final data=decoded['data'];
    return data is Map<String,dynamic>?data:<String,dynamic>{};
  }

  Future<void> _command(String path,Map<String,dynamic> payload) async {
    final key=_pending.forCommand(path,payload);
    final response=await widget.apiClient.post(path,payload,key);
    final raw=await response.transform(utf8.decoder).join();
    final decoded=jsonDecode(raw) as Map<String,dynamic>;
    if(response.statusCode<200||response.statusCode>=300){
      final err=decoded['error'];
      throw StateError(err is Map?' ${err['code']??'TONTINE_PROTECTION_HTTP_${response.statusCode}'}':'TONTINE_PROTECTION_HTTP_${response.statusCode}');
    }
    _pending.complete(path,payload);
  }

  Future<void> _load() async {
    if(!mounted)return;
    setState(()=>_loading=true);_error=null;
    try{
      final data=await _read('/v1/tontine/groups/${Uri.encodeComponent(widget.groupId)}/protection-policies');
      final rows=(data['items'] as List? ??const []).whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
      if(mounted)setState(()=>_policies=rows);
    }catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_loading=false);}
  }

  Future<void> _createPolicy() async {
    final version=TextEditingController(text:'v1');
    final insurer=TextEditingController();
    final license=TextEditingController();
    final contract=TextEditingController();
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Proposer une police CT-042'),
      content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
        TextField(controller:version,decoration:const InputDecoration(labelText:'Version')),
        TextField(controller:insurer,decoration:const InputDecoration(labelText:'UUID de l’assureur agréé')),
        TextField(controller:license,decoration:const InputDecoration(labelText:'Référence d’agrément')),
        TextField(controller:contract,decoration:const InputDecoration(labelText:'Référence du contrat signé')),
        const SizedBox(height:8),
        const Text('La création reste un brouillon. Les vérifications documentaires et le contrôle maker/checker sont obligatoires.',style:TextStyle(fontSize:12)),
      ])),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Annuler')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Proposer'))],
    ));
    if(accepted!=true)return;
    if(version.text.trim().isEmpty||insurer.text.trim().isEmpty||license.text.trim().isEmpty||contract.text.trim().isEmpty){
      setState(()=>_error='Tous les champs assureur sont obligatoires.');return;
    }
    setState(()=>_busy=true);_error=null;_notice=null;
    try{
      final path='/v1/tontine/groups/${Uri.encodeComponent(widget.groupId)}/protection-policies';
      await _command(path,{
        'version':version.text.trim(),'insurerPartnerId':insurer.text.trim(),
        'insurerLicenseReference':license.text.trim(),'insurerContractReference':contract.text.trim(),
        'currency':'XOF','effectiveFrom':DateTime.now().add(const Duration(minutes:1)).toUtc().toIso8601String(),
      });
      if(mounted)setState(()=>_notice='Brouillon créé. Aucun prélèvement n’est activé.');
      await _load();
    }catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_busy=false);}
  }

  Future<void> _verifyInsurer(String policyId) async {
    final reference=TextEditingController();
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Vérification conformité T.Pay'),
      content:TextField(controller:reference,decoration:const InputDecoration(labelText:'Référence du dossier de vérification')),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Annuler')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Confirmer la vérification'))],
    ));
    if(accepted!=true)return;
    await _runAction('/v1/tontine/groups/${Uri.encodeComponent(widget.groupId)}/protection-policies/${Uri.encodeComponent(policyId)}/verify-insurer',{'verificationReference':reference.text.trim()},'Vérification enregistrée.');
  }

  Future<void> _runAction(String path,Map<String,dynamic> payload,String success) async {
    setState(()=>_busy=true);_error=null;_notice=null;
    try{await _command(path,payload);if(mounted)setState(()=>_notice=success);await _load();}
    catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_busy=false);}
  }

  Widget _tierCard(Map<String,Object> tier){
    return Expanded(child:Container(
      padding:const EdgeInsets.all(12),decoration:BoxDecoration(
        color:Colors.white,borderRadius:BorderRadius.circular(16),
        border:Border.all(color:_protectionGreen.withValues(alpha:.18)),
        boxShadow:[BoxShadow(color:_protectionInk.withValues(alpha:.06),blurRadius:18,offset:const Offset(0,8))]),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(tier['tier'] as String,style:const TextStyle(fontWeight:FontWeight.w900,fontSize:11,color:_protectionInk)),
        const SizedBox(height:8),
        Text('${tier['rate']}%',style:const TextStyle(fontSize:24,fontWeight:FontWeight.w900,color:_protectionGreen)),
        const Text('par échéance',style:TextStyle(fontSize:10,color:Colors.black54)),
        const SizedBox(height:8),
        Text('Plafond : ${tier['covered']} échéance(s)',style:const TextStyle(fontSize:10)),
        Text('Grâce : ${tier['grace']} j',style:const TextStyle(fontSize:10)),
        Text('Attente : ${tier['waiting']} j',style:const TextStyle(fontSize:10)),
      ]),
    ));
  }

  @override
  Widget build(BuildContext context){
    final reduce=MediaQuery.of(context).disableAnimations;
    return FadeTransition(opacity:_entry,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      AnimatedContainer(duration:reduce?Duration.zero:const Duration(milliseconds:500),padding:const EdgeInsets.all(18),
        decoration:BoxDecoration(borderRadius:BorderRadius.circular(22),gradient:const LinearGradient(colors:[Color(0xff123d31),Color(0xff176c50)]),boxShadow:[BoxShadow(color:_protectionGreen.withValues(alpha:.18),blurRadius:24,offset:const Offset(0,12))]),
        child:Row(children:[
          const Icon(Icons.shield_moon_outlined,color:Colors.white,size:34),
          const SizedBox(width:12),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('CT-042 · PROTECTION DU CYCLE',style:TextStyle(color:Color(0xffbdebd8),fontWeight:FontWeight.w800,fontSize:10,letterSpacing:1)),
            const SizedBox(height:6),
            const Text('Continuité, consentement et contrôle',style:TextStyle(color:Colors.white,fontWeight:FontWeight.w900,fontSize:17)),
            const SizedBox(height:4),
            Text('L’assureur agréé porte le risque et décide des sinistres.',style:TextStyle(color:Colors.white.withValues(alpha:.82),fontSize:11)),
          ])),
        ]),
      ),
      const SizedBox(height:12),
      const Text('Gammes indicatives · non commercialisables',style:TextStyle(fontWeight:FontWeight.w800,color:_protectionInk)),
      const SizedBox(height:8),
      Row(children:[
        _tierCard(_protectionTiers[0]),const SizedBox(width:6),
        _tierCard(_protectionTiers[1]),const SizedBox(width:6),
        _tierCard(_protectionTiers[2]),
      ]),
      const SizedBox(height:10),
      Container(padding:const EdgeInsets.all(12),decoration:BoxDecoration(color:const Color(0xfffff4df),borderRadius:BorderRadius.circular(14)),
        child:const Text('Les taux 1 %, 2 % et 3 % sont des hypothèses. Aucune prime n’est prélevée sans contrat validé, consentement explicite et instruction Financial Core.',style:TextStyle(fontSize:11,color:Color(0xff805317)))),
      const SizedBox(height:12),
      Row(children:[const Expanded(child:Text('Registre des polices',style:TextStyle(fontWeight:FontWeight.w900,fontSize:16))),IconButton(onPressed:_loading?null:_load,icon:const Icon(Icons.refresh))]),
      if(_error!=null)Container(width:double.infinity,padding:const EdgeInsets.all(10),decoration:BoxDecoration(color:const Color(0xffffeeee),borderRadius:BorderRadius.circular(12)),child:Text(_error!,style:const TextStyle(color:Colors.red))),
      if(_notice!=null)Container(width:double.infinity,padding:const EdgeInsets.all(10),decoration:BoxDecoration(color:const Color(0xffe9f7f1),borderRadius:BorderRadius.circular(12)),child:Text(_notice!,style:const TextStyle(color:_protectionGreen))),
      if(_loading&&_policies.isEmpty)const LinearProgressIndicator(),
      if(!_loading&&_policies.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(14),child:Text('Aucune police proposée pour ce groupe.'))),
      for(final policy in _policies)Card(
        margin:const EdgeInsets.only(bottom:8),child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[Expanded(child:Text('Version ${policy['version']??'—'}',style:const TextStyle(fontWeight:FontWeight.w900))),Chip(label:Text((policy['state']??'').toString()))]),
          Text('Origine : ${policy['proposalOrigin']??'—'} · Devise : ${policy['currency']??'—'}'),
          Text('Agrément : ${policy['insurerLicenseVerified']==true?'vérifié':'en attente'} · Contrat : ${policy['insurerContractVerified']==true?'vérifié':'en attente'}'),
          Text('Hash : ${(policy['policyHash']??'').toString().substring(0,min(12,(policy['policyHash']??'').toString().length))}…',style:const TextStyle(fontSize:10,color:Colors.black54)),
          const SizedBox(height:8),
          Wrap(spacing:8,runSpacing:4,children:[
            if(policy['state']=='DRAFT'&&policy['insurerLicenseVerified']!=true&&policy['insurerContractVerified']!=true)OutlinedButton(onPressed:_busy?null:()=>_verifyInsurer(policy['id'].toString()),child:const Text('Vérifier assureur (conformité)')),
            if(policy['state']=='DRAFT'&&policy['insurerLicenseVerified']==true&&policy['insurerContractVerified']==true)FilledButton(onPressed:_busy?null:()=>_runAction('/v1/tontine/groups/${Uri.encodeComponent(widget.groupId)}/protection-policies/${Uri.encodeComponent(policy['id'].toString())}/approve',{},'Police approuvée.'),child:const Text('Approuver (maker/checker)')),
            if(policy['state']=='APPROVED'&&policy['insurerLicenseVerified']==true&&policy['insurerContractVerified']==true)FilledButton(onPressed:_busy?null:()=>_runAction('/v1/tontine/groups/${Uri.encodeComponent(widget.groupId)}/protection-policies/${Uri.encodeComponent(policy['id'].toString())}/activate',{},'Police activée.'),child:const Text('Activer la version')),
          ]),
        ])),
      ),
      const SizedBox(height:8),
      FilledButton.icon(onPressed:_busy?null:_createPolicy,icon:const Icon(Icons.add),label:const Text('Proposer une police brouillon')),
    ]));
  }
}
