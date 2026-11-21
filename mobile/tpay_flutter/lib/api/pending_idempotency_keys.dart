import 'dart:convert';

/// Retains an operation's idempotency key until the server confirms success.
/// A retry after timeout or disconnection therefore reuses the original key.
class PendingIdempotencyKeys {
  PendingIdempotencyKeys(this._createKey);

  final String Function() _createKey;
  final Map<String, String> _pending = <String, String>{};

  String forCommand(String path, Map<String, dynamic> payload) {
    final fingerprint = jsonEncode(<String, dynamic>{
      'path': path,
      'payload': payload,
    });
    return _pending.putIfAbsent(fingerprint, _createKey);
  }

  void complete(String path, Map<String, dynamic> payload) {
    final fingerprint = jsonEncode(<String, dynamic>{
      'path': path,
      'payload': payload,
    });
    _pending.remove(fingerprint);
  }
}
