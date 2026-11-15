class CommunityTontineFinanceSummary {
  const CommunityTontineFinanceSummary({
    required this.totalCount,
    required this.confirmedCount,
    required this.pendingCount,
    required this.exceptionCount,
    required this.invalidAmountCount,
    required this.confirmedMinor,
    required this.pendingMinor,
  });

  final int totalCount;
  final int confirmedCount;
  final int pendingCount;
  final int exceptionCount;
  final int invalidAmountCount;
  final BigInt confirmedMinor;
  final BigInt pendingMinor;

  factory CommunityTontineFinanceSummary.fromRows(
    List<Map<String, dynamic>> rows,
  ) {
    var confirmedCount = 0;
    var pendingCount = 0;
    var exceptionCount = 0;
    var invalidAmountCount = 0;
    var confirmedMinor = BigInt.zero;
    var pendingMinor = BigInt.zero;

    for (final row in rows) {
      final raw = row['amount_minor'];
      final text = raw is String || raw is int ? raw.toString() : '';
      final amount = RegExp(r'^[0-9]{1,38}$').hasMatch(text)
          ? BigInt.tryParse(text)
          : null;
      if (amount == null) invalidAmountCount++;

      switch (row['status']) {
        case 'confirmed':
          confirmedCount++;
          if (amount != null) confirmedMinor += amount;
        case 'pending':
          pendingCount++;
          if (amount != null) pendingMinor += amount;
        default:
          // Failed, reversed, disputed and unknown states remain exceptions.
          exceptionCount++;
      }
    }

    return CommunityTontineFinanceSummary(
      totalCount: rows.length,
      confirmedCount: confirmedCount,
      pendingCount: pendingCount,
      exceptionCount: exceptionCount,
      invalidAmountCount: invalidAmountCount,
      confirmedMinor: confirmedMinor,
      pendingMinor: pendingMinor,
    );
  }
}
