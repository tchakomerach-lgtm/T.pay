import 'dart:convert';import 'package:flutter/material.dart';import 'package:flutter/services.dart';import 'app.dart';
Future<void> main() async {WidgetsFlutterBinding.ensureInitialized();final source=await rootBundle.loadString('assets/design-contract.json');runApp(TPayMobileApp(contract:jsonDecode(source) as Map<String,dynamic>));}
