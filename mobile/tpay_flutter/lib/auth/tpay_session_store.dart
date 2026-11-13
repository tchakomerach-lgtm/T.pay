import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TPaySecureSession {
  const TPaySecureSession({required this.baseUrl,required this.accessToken,required this.expiresAt});
  final String baseUrl;
  final String accessToken;
  final DateTime expiresAt;
}

class TPaySessionStore {
  TPaySessionStore({FlutterSecureStorage? storage}) : _storage=storage??const FlutterSecureStorage();
  final FlutterSecureStorage _storage;
  static const _tokenKey='tpay.session.access_token';
  static const _expiryKey='tpay.session.expires_at';
  static const _baseUrlKey='tpay.session.api_base_url';

  Future<void> save(TPaySecureSession session) async {
    final base=Uri.parse(session.baseUrl);
    if(base.scheme!='https'||base.host.isEmpty||session.accessToken.isEmpty||!session.expiresAt.isAfter(DateTime.now())){
      throw ArgumentError('TPAY_SECURE_SESSION_INVALID');
    }
    await _storage.write(key:_tokenKey,value:session.accessToken);
    await _storage.write(key:_expiryKey,value:session.expiresAt.toUtc().toIso8601String());
    await _storage.write(key:_baseUrlKey,value:base.origin);
  }

  Future<TPaySecureSession?> read({required String expectedBaseUrl}) async {
    final expected=Uri.parse(expectedBaseUrl);
    if(expected.scheme!='https'||expected.host.isEmpty)throw ArgumentError('TPAY_HTTPS_REQUIRED');
    final values=await Future.wait([
      _storage.read(key:_tokenKey),
      _storage.read(key:_expiryKey),
      _storage.read(key:_baseUrlKey),
    ]);
    final token=values[0],expiry=values[1],base=values[2];
    final expiresAt=expiry==null?null:DateTime.tryParse(expiry);
    if(token==null||token.isEmpty||expiresAt==null||!expiresAt.isAfter(DateTime.now())||base!=expected.origin){
      await clear();
      return null;
    }
    return TPaySecureSession(baseUrl:base!,accessToken:token,expiresAt:expiresAt);
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key:_tokenKey),
      _storage.delete(key:_expiryKey),
      _storage.delete(key:_baseUrlKey),
    ]);
  }
}
