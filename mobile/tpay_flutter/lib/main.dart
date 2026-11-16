import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app.dart';
import 'api/tpay_api_client.dart';
import 'auth/tpay_session_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final source=await rootBundle.loadString('assets/design-contract.json');
  const apiBaseUrl=String.fromEnvironment('TPAY_API_BASE_URL');
  TPayApiClient? apiClient;
  if(apiBaseUrl.isNotEmpty){
    final session=await TPaySessionStore().read(expectedBaseUrl:apiBaseUrl);
    if(session!=null){
      apiClient=TPayApiClient(baseUrl:session.baseUrl,accessToken:session.accessToken,expiresAt:session.expiresAt);
    }
  }
  runApp(TPayMobileApp(contract:jsonDecode(source) as Map<String,dynamic>,apiClient:apiClient));
}
