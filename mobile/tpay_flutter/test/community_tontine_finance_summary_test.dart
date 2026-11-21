import 'package:flutter_test/flutter_test.dart';
import 'package:tpay_mobile/community_tontine_finance_summary.dart';

void main() {
  test('counts persisted contribution states and sums exact minor units', () {
    final summary = CommunityTontineFinanceSummary.fromRows([
      {'status': 'confirmed', 'amount_minor': '9007199254740993'},
      {'status': 'confirmed', 'amount_minor': '7'},
      {'status': 'pending', 'amount_minor': '500'},
      {'status': 'failed', 'amount_minor': '200'},
    ]);

    expect(summary.totalCount, 4);
    expect(summary.confirmedCount, 2);
    expect(summary.pendingCount, 1);
    expect(summary.exceptionCount, 1);
    expect(summary.confirmedMinor, BigInt.parse('9007199254741000'));
    expect(summary.pendingMinor, BigInt.from(500));
    expect(summary.invalidAmountCount, 0);
  });

  test('rejects malformed amounts and treats unknown states as exceptions', () {
    final summary = CommunityTontineFinanceSummary.fromRows([
      {'status': 'confirmed', 'amount_minor': '10.5'},
      {'status': 'pending', 'amount_minor': '-1'},
      {'status': 'future_state', 'amount_minor': null},
    ]);

    expect(summary.invalidAmountCount, 3);
    expect(summary.confirmedMinor, BigInt.zero);
    expect(summary.pendingMinor, BigInt.zero);
    expect(summary.exceptionCount, 1);
  });

  test('empty API page remains empty', () {
    final summary = CommunityTontineFinanceSummary.fromRows([]);
    expect(summary.totalCount, 0);
    expect(summary.confirmedCount, 0);
    expect(summary.confirmedMinor, BigInt.zero);
  });
}
