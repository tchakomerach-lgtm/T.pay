import 'dart:convert';
import 'package:flutter/material.dart';
import 'api/tpay_api_client.dart';

const _brand = Color(0xff0f8f68);
const _muted = Color(0xff718078);
const _line = Color(0xffdde3e8);

class TPayMobileApp extends StatelessWidget {
  const TPayMobileApp({super.key, required this.contract, this.apiClient});
  final Map<String, dynamic> contract;
  final TPayApiClient? apiClient;

  @override
  Widget build(BuildContext context) {
    final modules = (contract['navigation'] as List).cast<Map<String, dynamic>>();
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'T.Pay OS',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: _brand),
        scaffoldBackgroundColor: const Color(0xfff6f8fa),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: _line),
          ),
        ),
        pageTransitionsTheme: const PageTransitionsTheme(
          builders: {
            TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
            TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          },
        ),
      ),
      home: TPayHomePage(modules: modules, apiClient: apiClient),
    );
  }
}

class TPayHomePage extends StatefulWidget {
  const TPayHomePage({super.key, required this.modules, this.apiClient});
  final List<Map<String, dynamic>> modules;
  final TPayApiClient? apiClient;

  @override
  State<TPayHomePage> createState() => _TPayHomePageState();
}

class _TPayHomePageState extends State<TPayHomePage> {
  int selected = 0;
  Future<Map<String, dynamic>>? _schoolData;

  void _openModule(int index) {
    setState(() {
      selected = index;
      if (widget.modules[index]['id'] == 'education' && widget.apiClient != null) {
        _schoolData = _loadSchoolData();
      }
    });
  }

  Future<Map<String, dynamic>> _loadSchoolData() async {
    final client = widget.apiClient!;
    final responses = await Future.wait([
      client.get('/v1/education/classes'),
      client.get('/v1/education/students?limit=100'),
    ]);
    final decoded = <Map<String, dynamic>>[];
    for (final response in responses) {
      final body = jsonDecode(await response.transform(utf8.decoder).join());
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError('SCHOOL_API_HTTP_${response.statusCode}');
      }
      decoded.add(body as Map<String, dynamic>);
    }
    List<Map<String, dynamic>> items(Map<String, dynamic> body) {
      final data = body['data'] as Map<String, dynamic>?;
      final raw = data?['items'];
      if (raw is! List) return <Map<String, dynamic>>[];
      return raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
    }
    return {'classes': items(decoded[0]), 'students': items(decoded[1])};
  }

  @override
  Widget build(BuildContext context) {
    final module = widget.modules[selected];
    final groups = widget.modules.map((m) => m['group'] as String).toSet().toList();
    final wide = MediaQuery.sizeOf(context).width >= 900;
    return Scaffold(
      appBar: AppBar(
        title: const Text('T.Pay OS', style: TextStyle(fontWeight: FontWeight.w800)),
        surfaceTintColor: Colors.transparent,
      ),
      drawer: wide ? null : Drawer(child: _navigation(groups)),
      body: Row(
        children: [
          if (wide) SizedBox(width: 260, child: _navigation(groups)),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 320),
              reverseDuration: const Duration(milliseconds: 180),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0.025, 0),
                    end: Offset.zero,
                  ).animate(animation),
                  child: child,
                ),
              ),
              child: _page(module, key: ValueKey(module['id'])),
            ),
          ),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: selected < 4 ? selected : 0,
              onDestinationSelected: _openModule,
              destinations: const [
                NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Accueil'),
                NavigationDestination(icon: Icon(Icons.apartment_outlined), label: 'Organisations'),
                NavigationDestination(icon: Icon(Icons.people_outline), label: 'Social'),
                NavigationDestination(icon: Icon(Icons.work_outline), label: 'Work'),
              ],
            ),
    );
  }

  Widget _navigation(List<String> groups) => SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(10),
          children: [
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text('OPERATING SYSTEM',
                  style: TextStyle(fontSize: 10, letterSpacing: 1.5, color: _muted)),
            ),
            for (final group in groups) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                child: Text(group.toUpperCase(),
                    style: const TextStyle(fontSize: 9, letterSpacing: 1.1, color: _muted)),
              ),
              for (var i = 0; i < widget.modules.length; i++)
                if (widget.modules[i]['group'] == group)
                  ListTile(
                    dense: true,
                    selected: selected == i,
                    selectedTileColor: const Color(0xffe8f5ee),
                    leading: Icon(
                      _icon(widget.modules[i]['id'] as String),
                      color: selected == i ? _brand : _muted,
                    ),
                    title: Text(widget.modules[i]['label'] as String,
                        style: const TextStyle(fontSize: 12)),
                    onTap: () {
                      _openModule(i);
                      if (Navigator.canPop(context)) Navigator.pop(context);
                    },
                  ),
            ],
          ],
        ),
      );

  Widget _page(Map<String, dynamic> module, {required Key key}) {
    final home = module['id'] == 'home';
    final school = module['id'] == 'education';
    return SafeArea(
      key: key,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xfffff8e8),
              border: Border.all(color: const Color(0xfff0e1bb)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              school && widget.apiClient != null
                  ? 'DONNÉES SERVEUR — consultation en lecture seule, aucune mutation exécutée.'
                  : 'APERÇU — données métier non chargées, aucune opération réelle exécutée.',
              style: const TextStyle(fontSize: 10, color: Color(0xff795f26)),
            ),
          ),
          const SizedBox(height: 22),
          if (home) _hero3d() else if (school) _schoolHero() else ...[
            Text(module['label'] as String,
                style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w800, height: 1.15)),
            const SizedBox(height: 8),
            Text(module['description'] as String,
                style: const TextStyle(fontSize: 12, color: _muted)),
          ],
          const SizedBox(height: 20),
          if (home) ...[
            const Text('Vos applications',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 10),
            LayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.maxWidth > 720 ? 3 : constraints.maxWidth > 430 ? 2 : 1;
                return GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    crossAxisSpacing: 9,
                    mainAxisSpacing: 9,
                    childAspectRatio: columns == 1 ? 3 : 1.5,
                  ),
                  itemCount: widget.modules.length - 1,
                  itemBuilder: (context, index) {
                    final item = widget.modules[index + 1];
                    return _moduleCard(item, index);
                  },
                );
              },
            ),
          ] else if (school) ...[
            _schoolBody(),
          ] else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('ÉTAT DES DONNÉES',
                        style: TextStyle(fontSize: 9, letterSpacing: 1.2,
                            color: _brand, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    const Text('Aucune donnée métier n’est inventée.',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text(
                      'Connecte les services T.Pay pour afficher les informations réelles de ${module['label']}.',
                      style: const TextStyle(fontSize: 11, color: _muted),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Identité, permissions, règles métier, idempotence, audit et transactions restent sous l’autorité des services T.Pay.',
                style: TextStyle(fontSize: 11, color: _muted),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Center(
            child: Text('T.Pay OS · Flutter renderer · Motion system 3D',
                style: TextStyle(fontSize: 9, color: Color(0xff84928a))),
          ),
        ],
      ),
    );
  }


  Widget _schoolHero() => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xff084d3a), _brand, Color(0xff35a982)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [
            BoxShadow(color: Color(0x330b674d), blurRadius: 24, offset: Offset(0, 12)),
          ],
        ),
        child: Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('SCHOOL OS · ESPACE SCOLAIRE',
                      style: TextStyle(fontSize: 9, letterSpacing: 1.3, color: Colors.white70)),
                  SizedBox(height: 12),
                  Text('La gestion scolaire.\\nUn espace unifié.',
                      style: TextStyle(fontSize: 23, height: 1.12,
                          fontWeight: FontWeight.w800, color: Colors.white)),
                  SizedBox(height: 8),
                  Text('Classes, inscriptions et suivi des élèves.',
                      style: TextStyle(fontSize: 10, color: Colors.white70)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Container(
              width: 70,
              height: 70,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(
                  center: Alignment(-0.35, -0.4),
                  colors: [Color(0xffd7ffec), Color(0xff57d6a4), Color(0xff08714f)],
                ),
                boxShadow: const [
                  BoxShadow(color: Color(0x55002f20), blurRadius: 18, offset: Offset(0, 10)),
                ],
              ),
              child: const Text('É',
                  style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900,
                      color: Color(0xff07563e))),
            ),
          ],
        ),
      );

  Widget _schoolBody() {
    final future = _schoolData;
    if (widget.apiClient == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _schoolMetrics(null, null),
          const SizedBox(height: 14),
          _schoolPanel(
            title: 'Classes et niveaux',
            child: const Text('Connexion sécurisée requise pour charger les classes réelles.',
                style: TextStyle(fontSize: 11, color: _muted)),
          ),
          const SizedBox(height: 12),
          _schoolPanel(
            title: 'Élèves et inscriptions',
            child: const Text('Aucune donnée de démonstration n’est affichée.',
                style: TextStyle(fontSize: 11, color: _muted)),
          ),
        ],
      );
    }
    if (future == null) {
      return Center(
        child: OutlinedButton.icon(
          onPressed: () => setState(() => _schoolData = _loadSchoolData()),
          icon: const Icon(Icons.refresh),
          label: const Text('Charger les données scolaires'),
        ),
      );
    }
    return FutureBuilder<Map<String, dynamic>>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(30),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError) {
          return _schoolPanel(
            title: 'Chargement impossible',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(snapshot.error.toString(),
                    style: const TextStyle(fontSize: 10, color: Colors.red)),
                TextButton(
                  onPressed: () => setState(() => _schoolData = _loadSchoolData()),
                  child: const Text('Réessayer'),
                ),
              ],
            ),
          );
        }
        final data = snapshot.data!;
        final classes = (data['classes'] as List).cast<Map<String, dynamic>>();
        final students = (data['students'] as List).cast<Map<String, dynamic>>();
        final enrolled = classes.fold<int>(
          0, (sum, item) => sum + ((item['enrolled_count'] as num?)?.toInt() ?? 0));
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _schoolMetrics(classes.length, enrolled),
            const SizedBox(height: 14),
            _schoolPanel(
              title: 'Classes et niveaux',
              child: classes.isEmpty
                  ? const Text('Aucune classe enregistrée.',
                      style: TextStyle(fontSize: 11, color: _muted))
                  : Column(
                      children: classes.map((item) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.class_outlined, color: _brand),
                        title: Text(item['name']?.toString() ?? 'Classe',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        subtitle: Text('${item['grade_level']} · ${item['academic_year']}',
                            style: const TextStyle(fontSize: 10, color: _muted)),
                        trailing: Text('${item['enrolled_count']}/${item['capacity']}',
                            style: const TextStyle(fontSize: 10, color: _brand)),
                      )).toList(),
                    ),
            ),
            const SizedBox(height: 12),
            _schoolPanel(
              title: 'Élèves et inscriptions',
              child: students.isEmpty
                  ? const Text('Aucun élève correspondant.',
                      style: TextStyle(fontSize: 11, color: _muted))
                  : Column(
                      children: students.take(30).map((item) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const CircleAvatar(
                          radius: 16,
                          backgroundColor: Color(0xffe8f5ee),
                          child: Icon(Icons.person_outline, size: 17, color: _brand),
                        ),
                        title: Text(item['display_name']?.toString() ?? item['student_id'].toString(),
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                        subtitle: Text(item['class_id']?.toString() ?? 'Non affecté',
                            style: const TextStyle(fontSize: 9, color: _muted)),
                        trailing: Text(item['lifecycle']?.toString() ?? '—',
                            style: const TextStyle(fontSize: 9, color: _brand)),
                      )).toList(),
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _schoolMetrics(int? classes, int? enrolled) => Row(
        children: [
          Expanded(child: _schoolMetric('Classes actives', classes?.toString() ?? '—')),
          const SizedBox(width: 8),
          Expanded(child: _schoolMetric('Inscriptions actives', enrolled?.toString() ?? '—')),
        ],
      );

  Widget _schoolMetric(String label, String value) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 9, color: _muted)),
              const SizedBox(height: 7),
              Text(value, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800, color: _brand)),
            ],
          ),
        ),
      );

  Widget _schoolPanel({required String title, required Widget child}) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              child,
            ],
          ),
        ),
      );

  Widget _hero3d() => Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xff0b674d), _brand, Color(0xff35a982)],
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: const [
            BoxShadow(color: Color(0x330b674d), blurRadius: 26, offset: Offset(0, 14)),
          ],
        ),
        child: Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('T.PAY EXPERIENCE OS',
                      style: TextStyle(fontSize: 9, letterSpacing: 1.4, color: Colors.white70)),
                  SizedBox(height: 12),
                  Text('Votre activité.\nUn système unifié.',
                      style: TextStyle(fontSize: 27, height: 1.12,
                          fontWeight: FontWeight.w800, color: Colors.white)),
                  SizedBox(height: 8),
                  Text('Un point d’accès à vos organisations et services.',
                      style: TextStyle(fontSize: 11, color: Colors.white70)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: -0.10, end: 0),
              duration: const Duration(milliseconds: 850),
              curve: Curves.easeOutBack,
              builder: (context, angle, child) => Transform(
                alignment: Alignment.center,
                transform: Matrix4.identity()
                  ..setEntry(3, 2, 0.0015)
                  ..rotateY(angle)
                  ..rotateX(-0.08),
                child: child,
              ),
              child: Container(
                width: 82,
                height: 82,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const RadialGradient(
                    center: Alignment(-0.35, -0.4),
                    colors: [Color(0xffd7ffec), Color(0xff57d6a4), Color(0xff08714f)],
                  ),
                  border: Border.all(color: Colors.white54),
                  boxShadow: const [
                    BoxShadow(color: Color(0x55002f20), blurRadius: 22, offset: Offset(0, 12)),
                    BoxShadow(color: Color(0x55ffffff), blurRadius: 8, offset: Offset(-4, -4)),
                  ],
                ),
                child: const Text('T.',
                    style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900,
                        color: Color(0xff07563e))),
              ),
            ),
          ],
        ),
      );

  Widget _moduleCard(Map<String, dynamic> item, int index) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: Duration(milliseconds: 260 + (index % 5) * 45),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value.clamp(0.0, 1.0).toDouble(),
          child: Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.001)
              ..translateByDouble(0.0, (1 - value) * 12, 0.0)
              ..rotateX((1 - value) * 0.035),
            child: child,
          ),
        ),
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => _openModule(index + 1),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _line),
                boxShadow: const [
                  BoxShadow(color: Color(0x0d102b20), blurRadius: 8, offset: Offset(0, 2)),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(_icon(item['id'] as String), color: _brand),
                  const Spacer(),
                  Text(item['label'] as String,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                  Text(item['description'] as String,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 9, color: _muted)),
                ],
              ),
            ),
          ),
        ),
      );

  IconData _icon(String id) => switch (id) {
        'home' => Icons.home_outlined,
        'organizations' => Icons.apartment_outlined,
        'social' => Icons.people_outline,
        'opportunity' => Icons.work_outline,
        'tontine' => Icons.groups_2_outlined,
        'education' => Icons.school_outlined,
        'microfinance' => Icons.account_balance_outlined,
        'subsidy' => Icons.volunteer_activism_outlined,
        'finance' => Icons.account_balance_wallet_outlined,
        'wallet' => Icons.wallet_outlined,
        'marketplace' => Icons.storefront_outlined,
        'investment' => Icons.query_stats_outlined,
        'ai' => Icons.auto_awesome_outlined,
        'documents' => Icons.description_outlined,
        'workflows' => Icons.account_tree_outlined,
        'calendar' => Icons.calendar_month_outlined,
        'superadmin' => Icons.admin_panel_settings_outlined,
        _ => Icons.layers_outlined,
      };
}
