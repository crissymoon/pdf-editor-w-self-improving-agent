import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/auth_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  bool _loading = false;

  // 2FA challenge state
  String? _challengeToken;
  final _codeCtrl = TextEditingController();

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    final auth = context.read<AuthProvider>();
    final result = await auth.login(
      email: _emailCtrl.text.trim(),
      password: _passwordCtrl.text,
    );

    if (!mounted) return;
    setState(() => _loading = false);

    if (result is LoginSuccess) {
      context.go('/home');
    } else if (result is LoginNeeds2FA) {
      setState(() => _challengeToken = result.challengeToken);
    } else if (result == null) {
      // errorMessage set in provider
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(auth.errorMessage ?? 'Login failed')),
      );
    }
  }

  Future<void> _verify2FA() async {
    if (_codeCtrl.text.trim().isEmpty) return;
    setState(() => _loading = true);

    final auth = context.read<AuthProvider>();
    final ok = await auth.verify2FA(
      code: _codeCtrl.text.trim(),
      challengeToken: _challengeToken!,
    );

    if (!mounted) return;
    setState(() => _loading = false);

    if (ok) {
      context.go('/home');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(auth.errorMessage ?? '2FA verification failed')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('XCM-PDF')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
          child: _challengeToken == null ? _loginForm() : _twoFAForm(),
        ),
      ),
    );
  }

  Widget _loginForm() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Sign in', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          TextFormField(
            controller: _emailCtrl,
            decoration: const InputDecoration(labelText: 'Email'),
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            validator: (v) =>
                (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _passwordCtrl,
            decoration: const InputDecoration(labelText: 'Password'),
            obscureText: true,
            validator: (v) =>
                (v == null || v.length < 6) ? 'Password too short' : null,
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Sign in'),
          ),
        ],
      ),
    );
  }

  Widget _twoFAForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Two-factor verification',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        const Text('Enter the 6-digit code from your authenticator app.'),
        const SizedBox(height: 24),
        TextField(
          controller: _codeCtrl,
          decoration: const InputDecoration(labelText: 'Verification code'),
          keyboardType: TextInputType.number,
          maxLength: 6,
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _loading ? null : _verify2FA,
          child: _loading
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Verify'),
        ),
        TextButton(
          onPressed: () => setState(() => _challengeToken = null),
          child: const Text('Back to sign in'),
        ),
      ],
    );
  }
}
