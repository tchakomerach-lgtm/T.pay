import 'package:flutter_test/flutter_test.dart';
import 'package:tpay_mobile/api/pending_idempotency_keys.dart';

void main() {
  test('retries reuse the same key until the command is confirmed', () {
    var sequence = 0;
    final keys = PendingIdempotencyKeys(() => 'key-${++sequence}');
    final payload = <String, dynamic>{'amountMinor': 12500, 'currency': 'XOF'};

    final first = keys.forCommand('/v1/tontine/contributions', payload);
    final retry = keys.forCommand('/v1/tontine/contributions', payload);

    expect(retry, first);
    expect(sequence, 1);

    keys.complete('/v1/tontine/contributions', payload);
    final nextOperation = keys.forCommand('/v1/tontine/contributions', payload);

    expect(nextOperation, isNot(first));
    expect(sequence, 2);
  });

  test('different routes or payloads receive different keys', () {
    var sequence = 0;
    final keys = PendingIdempotencyKeys(() => 'key-${++sequence}');

    final contribution = keys.forCommand('/v1/tontine/contributions', {'amount': 100});
    final refund = keys.forCommand('/v1/tontine/refunds', {'amount': 100});
    final changedAmount = keys.forCommand('/v1/tontine/contributions', {'amount': 200});

    expect({contribution, refund, changedAmount}, hasLength(3));
  });
}
