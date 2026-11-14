import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'api/tpay_api_client.dart';

const _tontineGreen=Color(0xff0f8f68);
const _tontineMuted=Color(0xff718078);

class CommunityTontineScreen extends StatefulWidget {
  const CommunityTontineScreen({super.key,this.apiClient});
  final TPayApiClient? apiClient;
  @override
  State<CommunityTontineScreen> createState()=>_CommunityTontineScreenState();
}

class _CommunityTontineScreenState extends State<CommunityTontineScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _entry=AnimationController(vsync:this,duration:const Duration(milliseconds:320))..forward();
  late final AnimationController _motion=AnimationController(vsync:this,duration:const Duration(seconds:7));
  List<Map<String,dynamic>> _groups=[];
  List<Map<String,dynamic>> _records=[];
  String? _selectedGroup;
  String _panel='members';
  bool _loading=false;
  bool _busy=false;
  String? _error;
  String _key()=>'${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1<<32)}';

  @override
  void initState(){super.initState();if(widget.apiClient!=null)_load();}
  @override
  void didChangeDependencies(){super.didChangeDependencies();if(MediaQuery.of(context).disableAnimations){_motion.stop();_motion.value=0.5;}else if(!_motion.isAnimating){_motion.repeat(reverse:true);}}
  @override
  void dispose(){_entry.dispose();_motion.dispose();super.dispose();}

  Future<Map<String,dynamic>> _read(String path) async {
    final response=await widget.apiClient!.get(path);
    final raw=await response.transform(utf8.decoder).join();
    final decoded=jsonDecode(raw) as Map<String,dynamic>;
    if(response.statusCode<200||response.statusCode>=300){
      final error=decoded['error'];
      throw StateError(error is Map?'${error['code']??'TONTINE_HTTP_${response.statusCode}'}':'TONTINE_HTTP_${response.statusCode}');
    }
    final data=decoded['data'];
    return data is Map<String,dynamic>?data:<String,dynamic>{};
  }

  Future<void> _command(String path,Map<String,dynamic> payload) async {
    final response=await widget.apiClient!.post(path,payload,_key());
    final raw=await response.transform(utf8.decoder).join();
    final decoded=jsonDecode(raw) as Map<String,dynamic>;
    if(response.statusCode<200||response.statusCode>=300){
      final error=decoded['error'];
      throw StateError(error is Map?'${error['code']??'TONTINE_HTTP_${response.statusCode}'}':'TONTINE_HTTP_${response.statusCode}');
    }
  }

  Future<void> _load() async {
    if(widget.apiClient==null)return;
    setState(()=>_loading=true);_error=null;
    try{
      final data=await _read('/v1/tontine/groups?limit=100');
      final items=(data['items'] as List? ??const []).whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
      if(!mounted)return;
      setState(()=>_groups=items);
      if(_selectedGroup==null||!items.any((g)=>g['id']==_selectedGroup))_selectedGroup=items.isEmpty?null:items.first['id']?.toString();
      await _loadPanel();
    }catch(error){if(mounted)setState(()=>_error=error.toString());}
    finally{if(mounted)setState(()=>_loading=false);}
  }

  Future<void> _loadPanel() async {
    if(widget.apiClient==null||_selectedGroup==null){if(mounted)setState(()=>_records=[]);return;}
    try{
      final data=await _read('/v1/tontine/groups/$_selectedGroup/$_panel?limit=100');
      final items=(data['items'] as List? ??const []).whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
      if(mounted)setState(()=>_records=items);
    }catch(error){if(mounted)setState(()=>_error=error.toString());}
  }

  Future<void> _showCommand({required String title,required List<Widget> fields,required Future<Map<String,dynamic>> Function() payload}) async {
    final formKey=GlobalKey<FormState>();
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:Text(title),
      content:Form(key:formKey,child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:fields))),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Annuler')),FilledButton(onPressed:()=>Navigator.pop(ctx,formKey.currentState?.validate()??false),child:const Text('Continuer'))],
    ));
    if(accepted!=true)return;
    setState(()=>_busy=true);_error=null;
    try{final body=await payload();await _command(body.remove('_path') as String,body);await _load();}
    catch(error){if(mounted)setState(()=>_error=error.toString());}
    finally{if(mounted)setState(()=>_busy=false);}
  }

  Future<void> _createGroup() async {
    final name=TextEditingController(),minimum=TextEditingController(text:'500'),fixed=TextEditingController(text:'500');
    String frequency='weekly',mode='fixed';
    await _showCommand(title:'Nouveau groupe communautaire',fields:[
      TextFormField(controller:name,decoration:const InputDecoration(labelText:'Nom du groupe'),validator:(v)=>v==null||v.trim().isEmpty?'Nom obligatoire':null),
      DropdownButtonFormField<String>(initialValue:frequency,decoration:const InputDecoration(labelText:'Fréquence'),items:const [DropdownMenuItem(value:'daily',child:Text('Quotidienne')),DropdownMenuItem(value:'weekly',child:Text('Hebdomadaire')),DropdownMenuItem(value:'monthly',child:Text('Mensuelle'))],onChanged:(v)=>frequency=v??'weekly'),
      DropdownButtonFormField<String>(initialValue:mode,decoration:const InputDecoration(labelText:'Cotisation'),items:const [DropdownMenuItem(value:'fixed',child:Text('Fixe')),DropdownMenuItem(value:'variable',child:Text('Variable')),DropdownMenuItem(value:'goal',child:Text('Objectif'))],onChanged:(v)=>mode=v??'fixed'),
      TextFormField(controller:minimum,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Minimum XOF'),validator:(v)=>int.tryParse(v??'')==null||int.parse(v!)<=0?'Montant invalide':null),
      if(mode=='fixed')TextFormField(controller:fixed,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Montant fixe XOF'),validator:(v)=>int.tryParse(v??'')==null||int.parse(v!)<int.parse(minimum.text.isEmpty?'1':minimum.text)?'Montant invalide':null),
    ],payload:()async=>{'_path':'/v1/tontine/groups','name':name.text.trim(),'countryCode':'TG','currency':'XOF','frequency':frequency,'contributionMode':mode,'minimumAmountMinor':minimum.text,'governance':'member_vote',if(mode=='fixed')'fixedAmountMinor':fixed.text});
    name.dispose();minimum.dispose();fixed.dispose();
  }

  Future<void> _invite() async {
    final client=TextEditingController();
    await _showCommand(title:'Inviter un membre',fields:[TextFormField(controller:client,decoration:const InputDecoration(labelText:'UUID du client'),validator:(v)=>RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(v??'')?null:'UUID invalide')],payload:()async=>{'_path':'/v1/tontine/groups/$_selectedGroup/members','clientId':client.text.trim()});
    client.dispose();
  }

  Future<void> _cycle() async {
    final start=TextEditingController(text:DateTime.now().toIso8601String().substring(0,10));
    final end=TextEditingController(text:DateTime.now().add(const Duration(days:7)).toIso8601String().substring(0,10));
    await _showCommand(title:'Générer un cycle',fields:[
      TextFormField(controller:start,decoration:const InputDecoration(labelText:'Début (AAAA-MM-JJ)'),validator:(v)=>DateTime.tryParse(v??'')==null?'Date invalide':null),
      TextFormField(controller:end,decoration:const InputDecoration(labelText:'Fin (AAAA-MM-JJ)'),validator:(v)=>DateTime.tryParse(v??'')==null?'Date invalide':null),
    ],payload:()async=>{'_path':'/v1/tontine/groups/$_selectedGroup/cycles','startsOn':start.text,'endsOn':end.text,'rulesVersion':'v1'});
    start.dispose();end.dispose();
  }

  Future<void> _openCase() async {
    final summary=TextEditingController();
    String type='incident',severity='medium';
    await _showCommand(title:'Ouvrir un dossier',fields:[
      DropdownButtonFormField<String>(initialValue:type,decoration:const InputDecoration(labelText:'Type'),items:const [DropdownMenuItem(value:'incident',child:Text('Incident')),DropdownMenuItem(value:'dispute',child:Text('Litige')),DropdownMenuItem(value:'risk_investigation',child:Text('Risque')),DropdownMenuItem(value:'recovery',child:Text('Recouvrement'))],onChanged:(v)=>type=v??'incident'),
      DropdownButtonFormField<String>(initialValue:severity,decoration:const InputDecoration(labelText:'Gravité'),items:const [DropdownMenuItem(value:'low',child:Text('Faible')),DropdownMenuItem(value:'medium',child:Text('Moyenne')),DropdownMenuItem(value:'high',child:Text('Élevée')),DropdownMenuItem(value:'critical',child:Text('Critique'))],onChanged:(v)=>severity=v??'medium'),
      TextFormField(controller:summary,maxLines:3,decoration:const InputDecoration(labelText:'Résumé'),validator:(v)=>v==null||v.trim().isEmpty?'Résumé obligatoire':null),
    ],payload:()async=>{'_path':'/v1/tontine/groups/$_selectedGroup/cases','type':type,'severity':severity,'summary':summary.text.trim()});
    summary.dispose();
  }

  @override
  Widget build(BuildContext context){
    if(widget.apiClient==null)return _locked();
    return FadeTransition(opacity:_entry,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      _hero(),
      const SizedBox(height:16),
      if(_error!=null)Card(color:const Color(0xffffefed),child:Padding(padding:const EdgeInsets.all(12),child:Text(_error!,style:const TextStyle(color:Color(0xffa33327))))),
      Row(children:[Expanded(child:Text('Groupes réels · PostgreSQL',style:Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight:FontWeight.w800))),IconButton(onPressed:_loading?null:_load,icon:const Icon(Icons.refresh))]),
      if(_loading&&_groups.isEmpty)const LinearProgressIndicator(),
      if(_groups.isEmpty&&!_loading)const Card(child:Padding(padding:EdgeInsets.all(16),child:Text('Aucun groupe enregistré pour cette organisation.'))),
      if(_groups.isNotEmpty)DropdownButtonFormField<String>(initialValue:_selectedGroup,decoration:const InputDecoration(labelText:'Groupe sélectionné'),items:_groups.map((g)=>DropdownMenuItem(value:g['id'].toString(),child:Text(g['name'].toString(),overflow:TextOverflow.ellipsis))).toList(),onChanged:(v)async{setState(()=>_selectedGroup=v);await _loadPanel();}),
      const SizedBox(height:12),
      Wrap(spacing:8,runSpacing:8,children:[
        _action('Créer un groupe',Icons.add_circle_outline,_createGroup),
        _action('Inviter',Icons.person_add_alt_1,_selectedGroup==null?_load:_invite),
        _action('Créer un cycle',Icons.autorenew,_selectedGroup==null?_load:_cycle),
        _action('Signaler',Icons.report_outlined,_selectedGroup==null?_load:_openCase),
        _action('Actualiser',Icons.sync,_load),
      ]),
      const SizedBox(height:12),
      SegmentedButton<String>(segments:const [ButtonSegment(value:'members',label:Text('Membres')),ButtonSegment(value:'cycles',label:Text('Cycles')),ButtonSegment(value:'contributions',label:Text('Cotisations')),ButtonSegment(value:'governance',label:Text('Votes')),ButtonSegment(value:'cases',label:Text('Incidents'))],selected:{_panel},onSelectionChanged:(v)async{setState(()=>_panel=v.first);await _loadPanel();}),
      const SizedBox(height:10),
      if(_records.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(16),child:Text('Aucun enregistrement pour ce groupe.'))),
      for(final record in _records)Card(child:ListTile(title:Text((record['name']??record['summary']??record['type']??record['id']??'Enregistrement').toString()),subtitle:Text(record.entries.where((e)=>e.value!=null).take(4).map((e)=>'${e.key}: ${e.value}').join(' · ')),leading:const Icon(Icons.layers_outlined,color:_tontineGreen))),
      const SizedBox(height:8),
      Text('Une intention n’est pas un paiement confirmé. Le Financial Core reste seul autorisé à comptabiliser les fonds.',style:Theme.of(context).textTheme.bodySmall?.copyWith(color:_tontineMuted)),
    ]));
  }

  Widget _locked()=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    _hero(),const SizedBox(height:14),
    const Card(child:Padding(padding:EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Icon(Icons.lock_outline,color:_tontineGreen,size:30),SizedBox(height:10),
      Text('Session sécurisée requise',style:TextStyle(fontWeight:FontWeight.w800,fontSize:17)),
      SizedBox(height:6),Text('Les groupes, membres, cycles et dossiers ne sont affichés qu’après injection d’une session authentifiée. Aucune donnée fictive n’est créée.'),
    ]))),
  ]);

  Widget _hero()=>Container(
    padding:const EdgeInsets.all(18),
    decoration:BoxDecoration(gradient:const LinearGradient(colors:[Color(0xff103d35),Color(0xff0f8f68),Color(0xff43b88c)],begin:Alignment.topLeft,end:Alignment.bottomRight),borderRadius:BorderRadius.circular(20),boxShadow:const [BoxShadow(color:Color(0x330b674d),blurRadius:22,offset:Offset(0,12))]),
    child:Row(children:[
      const Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('T.PAY · COMMUNITY TONTINE',style:TextStyle(fontSize:9,letterSpacing:1.2,color:Colors.white70,fontWeight:FontWeight.w800)),
        SizedBox(height:10),Text('La solidarité,\nstructurée et transparente.',style:TextStyle(fontSize:21,height:1.12,color:Colors.white,fontWeight:FontWeight.w900)),
        SizedBox(height:8),Text('Groupes · cycles · membres · gouvernance',style:TextStyle(fontSize:10,color:Colors.white70)),
      ])),
      const SizedBox(width:12),
      AnimatedBuilder(
        animation:_motion,
        builder:(context,child)=>Transform(
          alignment:Alignment.center,
          transform:Matrix4.identity()
            ..setEntry(3,2,0.001)
            ..rotateY(-.22+(_motion.value*.44))
            ..rotateX(.06+(_motion.value*.08)),
          child:child,
        ),
        child:Container(
          width:72,height:72,
          decoration:const BoxDecoration(
            shape:BoxShape.circle,
            gradient:RadialGradient(colors:[Color(0xffe0fff0),Color(0xff55dca9),Color(0xff08714f)]),
            boxShadow:[BoxShadow(color:Color(0x66002118),blurRadius:20,offset:Offset(0,10))],
          ),
          alignment:Alignment.center,
          child:const Text('T',style:TextStyle(fontSize:35,fontWeight:FontWeight.w900,color:Color(0xff07563e))),
        ),
      ),
    ]),
  );

  Widget _action(String label,IconData icon,VoidCallback onPressed)=>FilledButton.tonalIcon(onPressed:_busy?null:onPressed,icon:Icon(icon,size:17),label:Text(label));
}
