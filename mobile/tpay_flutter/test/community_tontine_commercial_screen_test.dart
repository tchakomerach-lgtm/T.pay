import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tpay_mobile/community_tontine_commercial_screen.dart';

void main() {
  testWidgets('commercial workspace requires a secure API session and shows no demo records', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: CommunityTontineCommercialScreen(apiClient: null, groupId: 'group-test'),
      ),
    ));
    expect(find.text('Une session API sécurisée est requise. Aucune donnée de démonstration n’est affichée.'), findsOneWidget);
  });

  testWidgets('reduced motion keeps the commercial 3D header static', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: CommunityTontineCommercialScreen(apiClient: null, groupId: 'group-test'),
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Une session API sécurisée est requise. Aucune donnée de démonstration n’est affichée.'), findsOneWidget);
  });
}
