import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/pdf_provider.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _pickFile(BuildContext context) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
    );
    if (result == null || result.files.single.path == null) return;

    final path = result.files.single.path!;
    if (!context.mounted) return;

    await context.read<PdfProvider>().openFile(path);
    if (!context.mounted) return;
    context.push('/viewer');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('XCM-PDF'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await context.read<AuthProvider>().logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (auth.user != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Text(
                  'Hello, ${auth.user!.email}',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              ),
            const Icon(Icons.picture_as_pdf_outlined, size: 72, color: Colors.grey),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => _pickFile(context),
              icon: const Icon(Icons.folder_open),
              label: const Text('Open PDF'),
            ),
          ],
        ),
      ),
    );
  }
}
