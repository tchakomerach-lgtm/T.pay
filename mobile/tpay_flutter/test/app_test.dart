import 'package:flutter_test/flutter_test.dart';
import 'package:tpay_mobile/app.dart';

void main() {
  const contract = <String, dynamic>{
    'version': '1.1.0',
    'navigation': [
      {
        'id': 'home',
        'label': 'Vue d’ensemble',
        'group': 'Espace de travail',
        'description': 'Vue consolidée.',
      },
      {
        'id': 'education',
        'label': 'School OS',
        'group': 'Verticales',
        'description': 'Classes et inscriptions.',
      },
      {
        'id': 'organizations',
        'label': 'Organisations',
        'group': 'Espace de travail',
        'description': 'Gestion des membres.',
      },
    ],
  };

  testWidgets('renders the 3D Experience OS home surface', (tester) async {
    await tester.pumpWidget(const TPayMobileApp(contract: contract));
    await tester.pumpAndSettle();

    expect(find.text('T.Pay OS'), findsOneWidget);
    expect(find.text('T.PAY EXPERIENCE OS'), findsOneWidget);
    expect(find.text('Vos applications'), findsOneWidget);
    expect(find.text('Organisations'), findsWidgets);
  });

  testWidgets('opens a module through the animated workspace transition', (tester) async {
    await tester.pumpWidget(const TPayMobileApp(contract: contract));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Organisations').first);
    await tester.pumpAndSettle();

    expect(find.text('Gestion des membres.'), findsOneWidget);
    expect(find.text('Aucune donnée métier n’est inventée.'), findsOneWidget);
  });
  testWidgets('shows School OS without inventing records when no secure session is injected', (tester) async {
    await tester.pumpWidget(const TPayMobileApp(contract: contract));
    await tester.pumpAndSettle();

    await tester.tap(find.text('School OS').first);
    await tester.pumpAndSettle();

    expect(find.text('SCHOOL OS · ESPACE SCOLAIRE'), findsOneWidget);
    expect(find.text('Connexion sécurisée requise pour charger les classes réelles.'), findsOneWidget);
    expect(find.text('Aucune donnée de démonstration n’est affichée.'), findsOneWidget);
  });
}


