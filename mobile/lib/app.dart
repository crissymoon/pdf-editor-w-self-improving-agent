import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/pdf_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/pdf_viewer_screen.dart';

final _router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
    GoRoute(path: '/viewer', builder: (_, __) => const PdfViewerScreen()),
  ],
);

class XcmPdfApp extends StatelessWidget {
  const XcmPdfApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => PdfProvider()),
      ],
      child: MaterialApp.router(
        title: 'XCM-PDF',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorSchemeSeed: const Color(0xFF1A73E8),
          useMaterial3: true,
        ),
        routerConfig: _router,
      ),
    );
  }
}
