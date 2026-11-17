import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'api/tpay_api_client.dart';
import 'api/pending_idempotency_keys.dart';

const _commercialInk = Color(0xff102f2a);
const _commercialMint = Color(0xff8ee4bf);
const _commercialLine = Color(0xffdce8e2);

/// Native Flutter surface for the same commercial APIs used by React.
/// No local/demo records are generated; all displayed rows come from the API.
class CommunityTontineCommercialScreen extends StatefulWidget {
  const CommunityTontineCommercialScreen({
    super.key,
    required this.apiClient,
    required this.groupId,
  });

  final TPayApiClient? apiClient;
  final String groupId;

  @override
  State<CommunityTontineCommercialScreen> createState() =>
      _CommunityTontineCommercialScreenState();
}

class _CommunityTontineCommercialScreenState
    extends State<CommunityTontineCommercialScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _motion = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  late final PendingIdempotencyKeys _keys = PendingIdempotencyKeys(_newKey);
  List<Map<String, dynamic>> _policies = [];
  List<Map<String, dynamic>> _roles = [];
  List<Map<String, dynamic>> _campaigns = [];
  bool _loading = false;
  String? _busy;
  String? _error;
  String? _notice;

  String _newKey() =>
      'tpay-commercial-${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';

  String get _base => '/v1/tontine/groups/${Uri.encodeComponent(widget.groupId)}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _motion.stop();
      _motion.value = 0.5;
    } else if (!_motion.isAnimating) {
      _motion.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant CommunityTontineCommercialScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.groupId != widget.groupId ||
        oldWidget.apiClient != widget.apiClient) {
      _load();
    }
  }

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _read(String path) async {
    final client = widget.apiClient;
    if (client == null) throw StateError('TPAY_SECURE_SESSION_REQUIRED');
    final response = await client.get(path);
    final raw = await response.transform(utf8.decoder).join();
    final decoded = jsonDecode(raw);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = decoded is Map ? decoded['error'] : null;
      throw StateError(error is Map
          ? '${error['code'] ?? 'TONTINE_COMMERCIAL_READ_FAILED'}'
          : 'TONTINE_COMMERCIAL_HTTP_${response.statusCode}');
    }
    if (decoded is! Map || decoded['data'] is! Map) return <String, dynamic>{};
    return Map<String, dynamic>.from(decoded['data'] as Map);
  }

  Future<void> _load() async {
    if (widget.apiClient == null || widget.groupId.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _read('$_base/commission-policies?state=all&level=CONTRIBUTION&currency=XOF'),
        _read('$_base/roles'),
        _read('$_base/promotions'),
      ]);
      if (!mounted) return;
      setState(() {
        _policies = _rows(results[0]);
        _roles = _rows(results[1]);
        _campaigns = _rows(results[2]);
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> _rows(Map<String, dynamic> data) =>
      (data['items'] as List? ?? const [])
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();

  Future<void> _command(String key, String path, Map<String, dynamic> payload) async {
    final client = widget.apiClient;
    if (client == null || _busy != null) return;
    setState(() {
      _busy = key;
      _error = null;
      _notice = null;
    });
    try {
      final idempotencyKey = _keys.forCommand(path, payload);
      final response = await client.post(path, payload, idempotencyKey);
      final raw = await response.transform(utf8.decoder).join();
      dynamic decoded;
      try { decoded = jsonDecode(raw); } catch (_) { decoded = null; }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = decoded is Map ? decoded['error'] : null;
        throw StateError(error is Map
            ? '${error['code'] ?? 'TONTINE_COMMERCIAL_COMMAND_FAILED'}'
            : 'TONTINE_COMMERCIAL_HTTP_${response.statusCode}');
      }
      _keys.complete(path, payload);
      if (!mounted) return;
      setState(() => _notice = 'Commande enregistrée. Registres actualisés depuis le serveur.');
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _createPolicy() async {
    final version = TextEditingController(text: 'v1');
    final rates = <String, TextEditingController>{
      for (final recipient in ['TPAY','PARTNER','AGENT','RESERVE','TAX','OPTIONAL_SERVICE'])
        recipient: TextEditingController(text: recipient == 'TPAY' ? '0' : '0'),
    };
    String level = 'CONTRIBUTION';
    String payer = 'MEMBER';
    String share = '10000';
    final enabled = <String>{'TPAY'};
    final form = GlobalKey<FormState>();
    final accepted = await showDialog<bool>(context: context, builder: (dialogContext) =>
      StatefulBuilder(builder: (context, setDialog) => AlertDialog(
        title: const Text('Nouvelle politique de commission'),
        content: SizedBox(width: 480, child: SingleChildScrollView(child: Form(
          key: form,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(controller: version, decoration: const InputDecoration(labelText: 'Version'), validator: (v) => v == null || v.trim().isEmpty ? 'Version obligatoire' : null),
            DropdownButtonFormField<String>(value: level, decoration: const InputDecoration(labelText: 'Niveau'), items: const [
              DropdownMenuItem(value:'CONTRIBUTION',child:Text('Cotisation')),
              DropdownMenuItem(value:'BENEFICIARY_PAYOUT',child:Text('Décaissement bénéficiaire')),
              DropdownMenuItem(value:'TRANSFER',child:Text('Transfert')),
              DropdownMenuItem(value:'OPTIONAL_SERVICE',child:Text('Service optionnel')),
            ], onChanged: (v) => setDialog(() => level = v ?? level)),
            DropdownButtonFormField<String>(value: payer, decoration: const InputDecoration(labelText: 'Payeur'), items: const [
              DropdownMenuItem(value:'MEMBER',child:Text('Membre')),
              DropdownMenuItem(value:'BENEFICIARY',child:Text('Bénéficiaire')),
              DropdownMenuItem(value:'SPLIT',child:Text('Partagé')),
            ], onChanged: (v) => setDialog(() { payer = v ?? payer; share = payer == 'MEMBER' ? '10000' : payer == 'BENEFICIARY' ? '0' : '5000'; })),
            TextFormField(initialValue: share, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Part membre (bps)'), onChanged: (v) => share = v, enabled: payer == 'SPLIT'),
            const SizedBox(height: 8),
            for (final entry in rates.entries) Row(children: [
              Expanded(child: CheckboxListTile(dense:true,contentPadding:EdgeInsets.zero,title:Text(entry.key,style:const TextStyle(fontSize:12)),value:enabled.contains(entry.key),onChanged:(v)=>setDialog(()=>v==true?enabled.add(entry.key):enabled.remove(entry.key)))),
              SizedBox(width:92,child:TextFormField(controller:entry.value,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'bps'),validator:(v){final n=int.tryParse(v??'');return n==null||n<0||n>10000?'0–10000':null;})),
            ]),
            const Text('100 points de base = 1 %. Les taux doivent provenir de l’accord commercial.',style:TextStyle(fontSize:11,color:Colors.black54)),
          ]),
        ))),
        actions: [
          TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Annuler')),
          FilledButton(onPressed:(){if(form.currentState?.validate()??false)Navigator.pop(dialogContext,true);},child:const Text('Créer le brouillon')),
        ],
      )));
    if (mounted && form.currentState != null) {
      // The dialog result is deliberately not inferred from field defaults.
    }
    // Form submission is handled by the explicit result below in the helper.
    // Controllers are disposed after the dialog closes.
    final components = rates.entries.map((e) => {
      'recipient':e.key,'rateBps':int.tryParse(e.value.text)??0,'enabled':enabled.contains(e.key)
    }).toList();
    final valid = version.text.trim().isNotEmpty && rates.values.every((c)=>int.tryParse(c.text)!=null);
    if (accepted == true && valid && mounted) {
      await _command('policy-create','$_base/commission-policies',{
        'version':version.text.trim(),'transactionLevel':level,'currency':'XOF',
        'payer':payer,'memberShareBps':int.tryParse(share)??0,
        'effectiveFrom':DateTime.now().add(const Duration(minutes:1)).toUtc().toIso8601String(),
        'components':components,
      });
    }
    version.dispose();
    for(final c in rates.values){c.dispose();}
  }

  Future<void> _createRole() async {
    final actor = TextEditingController();
    final permissions = TextEditingController(text:'member.invite');
    final from = DateTime.now();
    DateTime until = from.add(const Duration(days:1));
    String role = 'PRESIDENT';
    final form = GlobalKey<FormState>();
    final accepted = await showDialog<bool>(context:context,builder:(ctx)=>StatefulBuilder(builder:(ctx,setDialog)=>AlertDialog(
      title:const Text('Délégation temporaire'),
      content:Form(key:form,child:Column(mainAxisSize:MainAxisSize.min,children:[
        TextFormField(controller:actor,decoration:const InputDecoration(labelText:'UUID du membre'),validator:(v)=>RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(v??'')?null:'UUID invalide'),
        DropdownButtonFormField<String>(value:role,decoration:const InputDecoration(labelText:'Rôle'),items:const ['PRESIDENT','TREASURER','SECRETARY','COLLECTOR','CONTROLLER','MEDIATOR','MEMBER'].map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),onChanged:(v)=>setDialog(()=>role=v??role)),
        TextFormField(controller:permissions,decoration:const InputDecoration(labelText:'Permissions séparées par virgules')),
        ListTile(title:const Text('Expiration'),subtitle:Text(until.toLocal().toString()),trailing:IconButton(icon:const Icon(Icons.edit_calendar),onPressed:()async{final d=await showDatePicker(context:ctx,firstDate:DateTime.now(),lastDate:DateTime.now().add(const Duration(days:365)),initialDate:until);if(d!=null)setDialog(()=>until=DateTime(d.year,d.month,d.day,23,59));})),
      ])),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Annuler')),FilledButton(onPressed:()=>Navigator.pop(ctx,form.currentState?.validate()??false),child:const Text('Attribuer'))],
    )));
    if(accepted==true){
      await _command('role-create','$_base/roles',{
        'actorId':actor.text.trim(),'role':role,
        'permissions':permissions.text.split(',').map((x)=>x.trim()).where((x)=>x.isNotEmpty).toList(),
        'validFrom':from.toUtc().toIso8601String(),'expiresAt':until.toUtc().toIso8601String(),
      });
    }
    actor.dispose();permissions.dispose();
  }

  Future<void> _createCampaign() async {
    final code=TextEditingController();
    final title=TextEditingController();
    final reward=TextEditingController(text:'0');
    final quota=TextEditingController(text:'1');
    final budget=TextEditingController(text:'0');
    final form=GlobalKey<FormState>();
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Campagne communautaire'),
      content:Form(key:form,child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
        TextFormField(controller:code,textCapitalization:TextCapitalization.characters,decoration:const InputDecoration(labelText:'Code'),validator:(v)=>v==null||v.trim().length<3?'3 caractères minimum':null),
        TextFormField(controller:title,decoration:const InputDecoration(labelText:'Nom de campagne'),validator:(v)=>v==null||v.trim().isEmpty?'Nom obligatoire':null),
        TextFormField(controller:reward,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Récompense unitaire (XOF)'),validator:(v)=>int.tryParse(v??'')==null||int.parse(v!)<0?'Montant invalide':null),
        TextFormField(controller:quota,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Quota'),validator:(v)=>int.tryParse(v??'')==null||int.parse(v!)<1?'Quota invalide':null),
        TextFormField(controller:budget,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Budget maximal (XOF)'),validator:(v)=>int.tryParse(v??'')==null||int.parse(v!)<0?'Budget invalide':null),
      ]))),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Annuler')),FilledButton(onPressed:()=>Navigator.pop(ctx,form.currentState?.validate()??false),child:const Text('Créer le brouillon'))],
    ));
    if(accepted==true){
      final start=DateTime.now().add(const Duration(minutes:1));
      await _command('campaign-create','$_base/promotions',{
        'code':code.text.trim().toUpperCase(),'title':title.text.trim(),
        'startsAt':start.toUtc().toIso8601String(),'endsAt':start.add(const Duration(days:7)).toUtc().toIso8601String(),
        'currency':'XOF','rewardMinor':reward.text,'maxRedemptions':int.parse(quota.text),
        'maxBudgetMinor':budget.text,'allowedChannels':['LINK','QR'],
      });
    }
    code.dispose();title.dispose();reward.dispose();quota.dispose();budget.dispose();
  }

  Future<void> _reasonCommand(String key,String path,{bool reason=false}) async {
    final controller=TextEditingController();
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:Text(reason?'Justifier l’opération':'Confirmer l’opération'),
      content:reason?TextField(controller:controller,decoration:const InputDecoration(labelText:'Motif obligatoire'),maxLines:3):const Text('Cette opération sera enregistrée dans le registre de gouvernance.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Annuler')),FilledButton(onPressed:()=>Navigator.pop(ctx,!reason||controller.text.trim().isNotEmpty),child:const Text('Confirmer'))],
    ));
    if(accepted==true)await _command(key,path,reason?{'reason':controller.text.trim()}:<String,dynamic>{});
    controller.dispose();
  }

  Widget _surface({required String eyebrow,required String title,required Widget child,IconData icon=Icons.tune_rounded}) =>
    Container(
      margin:const EdgeInsets.only(bottom:12),
      padding:const EdgeInsets.all(15),
      decoration:BoxDecoration(
        color:Colors.white,borderRadius:BorderRadius.circular(20),
        border:Border.all(color:_commercialLine),
        boxShadow:const [BoxShadow(color:Color(0x100b4938),blurRadius:18,offset:Offset(0,7))],
      ),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[Icon(icon,color:const Color(0xff16855f)),const SizedBox(width:8),Expanded(child:Text(eyebrow,style:const TextStyle(fontSize:9,letterSpacing:1,fontWeight:FontWeight.w900,color:Color(0xff16855f))))]),
        const SizedBox(height:5),Text(title,style:const TextStyle(fontSize:17,fontWeight:FontWeight.w900,color:_commercialInk)),
        const SizedBox(height:12),child,
      ]),
    );

  Widget _record(String title,String detail,List<Widget> actions)=>Container(
    margin:const EdgeInsets.only(top:8),padding:const EdgeInsets.all(11),
    decoration:BoxDecoration(color:const Color(0xfff5faf7),borderRadius:BorderRadius.circular(13),border:Border.all(color:_commercialLine)),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:12)),
      const SizedBox(height:4),Text(detail,style:const TextStyle(fontSize:10,color:Colors.black54)),
      if(actions.isNotEmpty)Wrap(spacing:7,children:actions),
    ]),
  );

  @override
  Widget build(BuildContext context) {
    if(widget.apiClient==null)return const Center(child:Padding(padding:EdgeInsets.all(20),child:Text('Une session API sécurisée est requise. Aucune donnée de démonstration n’est affichée.')));
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      AnimatedBuilder(animation:_motion,builder:(context,child)=>Transform(
        alignment:Alignment.center,
        transform:Matrix4.identity()..setEntry(3,2,.001)..rotateY((_motion.value-.5)*.10)..rotateX((.5-_motion.value)*.035),
        child:child,
      ),child:Container(
        width:double.infinity,padding:const EdgeInsets.all(19),
        decoration:BoxDecoration(gradient:const LinearGradient(colors:[Color(0xff102f2a),Color(0xff176448),Color(0xff27855f)]),borderRadius:BorderRadius.circular(22),boxShadow:const [BoxShadow(color:Color(0x30216d50),blurRadius:22,offset:Offset(0,10))]),
        child:Row(children:[
          const Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('COMMUNITY TONTINE · GAIN',style:TextStyle(fontSize:9,letterSpacing:1.2,color:_commercialMint,fontWeight:FontWeight.w900)),
            SizedBox(height:7),Text('Gouvernance commerciale',style:TextStyle(color:Colors.white,fontSize:20,fontWeight:FontWeight.w900)),
            SizedBox(height:5),Text('Commissions versionnées · délégations · promotions',style:TextStyle(color:Colors.white70,fontSize:11)),
          ])),
          const Icon(Icons.account_balance_wallet_rounded,color:_commercialMint,size:38),
        ]),
      )),
      const SizedBox(height:12),
      Row(children:[Expanded(child:Text('Registres du groupe',style:Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight:FontWeight.w800))),IconButton(onPressed:_loading?null:_load,icon:const Icon(Icons.refresh))]),
      if(_error!=null)Material(color:const Color(0xffffefed),borderRadius:BorderRadius.circular(12),child:Padding(padding:const EdgeInsets.all(12),child:Text(_error!,style:const TextStyle(color:Color(0xffa33327))))),
      if(_notice!=null)Text(_notice!,style:const TextStyle(color:Color(0xff16734f),fontSize:11)),
      if(_loading)const LinearProgressIndicator(),
      _surface(eyebrow:'01 · COMMISSION ENGINE',title:'Politiques et validation maker/checker',icon:Icons.percent_rounded,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        FilledButton.icon(onPressed:_busy==null?_createPolicy:null,icon:const Icon(Icons.add),label:const Text('Créer une politique')),
        if(_policies.isEmpty)const Padding(padding:EdgeInsets.only(top:8),child:Text('Aucune politique enregistrée.',style:TextStyle(fontSize:12,color:Colors.black54))),
        for(final p in _policies)_record('${p['version']??'Version'} · ${p['transaction_level']??''}','${p['state']??'—'} · ${p['currency']??'XOF'} · hash ${(p['policy_hash']??'—').toString().substring(0,min(12,(p['policy_hash']??'—').toString().length))}',[
          if(p['state']=='DRAFT')OutlinedButton(onPressed:_busy==null?()=>_reasonCommand('policy-approve-${p['id']}','$_base/commission-policies/${p['id']}/approve',reason:true):null,child:const Text('Approuver')),
          if(p['state']=='APPROVED')FilledButton(onPressed:_busy==null?()=>_reasonCommand('policy-activate-${p['id']}','$_base/commission-policies/${p['id']}/activate',reason:true):null,child:const Text('Activer')),
        ]),
      ])),
      _surface(eyebrow:'02 · ADMINISTRATION TEMPORELLE',title:'Rôles et permissions',icon:Icons.admin_panel_settings_outlined,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        FilledButton.icon(onPressed:_busy==null?_createRole:null,icon:const Icon(Icons.person_add_alt_1),label:const Text('Déléguer un rôle')),
        if(_roles.isEmpty)const Padding(padding:EdgeInsets.only(top:8),child:Text('Aucune délégation enregistrée.',style:TextStyle(fontSize:12,color:Colors.black54))),
        for(final r in _roles)_record('${r['role']??'Rôle'} · ${(r['actor_id']??'').toString().substring(0,min(8,(r['actor_id']??'').toString().length))}','${r['valid_from']??''} → ${r['expires_at']??''} · ${r['revoked_at']!=null?'Révoqué':'Actif / historisé'}',[
          if(r['revoked_at']==null)TextButton(onPressed:_busy==null?()=>_reasonCommand('role-revoke-${r['id']}','$_base/roles/${r['id']}/revoke'):null,child:const Text('Révoquer')),
        ]),
      ])),
      _surface(eyebrow:'03 · CROISSANCE COMMUNAUTAIRE',title:'Campagnes et budgets promotionnels',icon:Icons.campaign_outlined,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        FilledButton.icon(onPressed:_busy==null?_createCampaign:null,icon:const Icon(Icons.add),label:const Text('Créer une campagne')),
        if(_campaigns.isEmpty)const Padding(padding:EdgeInsets.only(top:8),child:Text('Aucune campagne enregistrée.',style:TextStyle(fontSize:12,color:Colors.black54))),
        for(final c in _campaigns)_record('${c['code']??''} · ${c['title']??''}','${c['state']??''} · ${c['accepted_redemptions']??0}/${c['max_redemptions']??0} · Budget réservé ${c['committed_budget_minor']??0}/${c['max_budget_minor']??0} XOF',[
          if(c['state']=='DRAFT')OutlinedButton(onPressed:_busy==null?()=>_reasonCommand('campaign-approve-${c['id']}','$_base/promotions/${c['id']}/approve'):null,child:const Text('Approuver')),
          if(c['state']=='APPROVED')FilledButton(onPressed:_busy==null?()=>_reasonCommand('campaign-activate-${c['id']}','$_base/promotions/${c['id']}/activate'):null,child:const Text('Activer')),
        ]),
      ])),
      const SizedBox(height:8),
      const Text('Financial Core reste seul autorisé à comptabiliser les fonds. Une attribution promotionnelle n’est pas un paiement de récompense.',style:TextStyle(fontSize:10,color:Colors.black54,height:1.5)),
    ]);
  }
}
