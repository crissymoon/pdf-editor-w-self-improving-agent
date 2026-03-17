import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:provider/provider.dart';
import '../models/annotation.dart';
import '../providers/pdf_provider.dart';
import '../widgets/annotation_overlay.dart';
import '../widgets/toolbar_widget.dart';

class PdfViewerScreen extends StatefulWidget {
  const PdfViewerScreen({super.key});

  @override
  State<PdfViewerScreen> createState() => _PdfViewerScreenState();
}

class _PdfViewerScreenState extends State<PdfViewerScreen> {
  final _controller = PdfViewerController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pdf = context.watch<PdfProvider>();

    if (pdf.document == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Viewer')),
        body: const Center(child: Text('No document open.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          pdf.sourcePath?.split('/').last ?? 'Document',
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            tooltip: 'Undo',
            icon: const Icon(Icons.undo),
            onPressed: pdf.canUndo ? () => context.read<PdfProvider>().undo() : null,
          ),
          IconButton(
            tooltip: 'Redo',
            icon: const Icon(Icons.redo),
            onPressed: pdf.canRedo ? () => context.read<PdfProvider>().redo() : null,
          ),
        ],
      ),
      body: Column(
        children: [
          ToolbarWidget(
            activeTool: pdf.activeTool,
            onToolSelected: (t) => context.read<PdfProvider>().setActiveTool(t),
          ),
          Expanded(
            child: Stack(
              children: [
                PdfViewer.document(
                  pdf.document!,
                  controller: _controller,
                  params: const PdfViewerParams(
                    margin: 8,
                    backgroundColor: Color(0xFFE0E0E0),
                  ),
                ),
                AnnotationOverlay(
                  annotations: pdf.annotationsForPage(pdf.currentPage),
                  onTap: (offset, pageSize) {
                    final newAnnotation = Annotation(
                      id: DateTime.now().millisecondsSinceEpoch.toString(),
                      type: pdf.activeTool,
                      pageIndex: pdf.currentPage,
                      x: offset.dx,
                      y: offset.dy,
                      width: 120,
                      height: pdf.activeTool == AnnotationType.text ? 24 : 40,
                      content: _defaultContent(pdf.activeTool),
                    );
                    context.read<PdfProvider>().addAnnotation(newAnnotation);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _defaultContent(AnnotationType type) {
    switch (type) {
      case AnnotationType.text:
        return 'Text';
      case AnnotationType.date:
        final now = DateTime.now();
        return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
      case AnnotationType.checkbox:
        return 'unchecked';
      default:
        return '';
    }
  }
}
