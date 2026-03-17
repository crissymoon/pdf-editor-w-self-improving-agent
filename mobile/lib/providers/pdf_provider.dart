import 'package:flutter/foundation.dart';
import 'package:pdfrx/pdfrx.dart';
import '../models/annotation.dart';
import '../services/pdf_service.dart';

class PdfProvider extends ChangeNotifier {
  PdfDocument? _document;
  String? _sourcePath;
  int _currentPage = 0;
  int _pageCount = 0;
  AnnotationType _activeTool = AnnotationType.text;
  final List<Annotation> _annotations = [];

  // Undo/redo stacks (each entry is a snapshot of _annotations).
  final List<List<Annotation>> _undoStack = [];
  final List<List<Annotation>> _redoStack = [];

  PdfDocument? get document => _document;
  String? get sourcePath => _sourcePath;
  int get currentPage => _currentPage;
  int get pageCount => _pageCount;
  AnnotationType get activeTool => _activeTool;

  List<Annotation> get annotations => List.unmodifiable(_annotations);

  List<Annotation> annotationsForPage(int pageIndex) =>
      _annotations.where((a) => a.pageIndex == pageIndex).toList();

  bool get canUndo => _undoStack.isNotEmpty;
  bool get canRedo => _redoStack.isNotEmpty;

  Future<void> openFile(String path) async {
    _document = await PdfService.instance.openFile(path);
    _sourcePath = path;
    _pageCount = _document!.pages.length;
    _currentPage = 0;
    _annotations.clear();
    _undoStack.clear();
    _redoStack.clear();
    notifyListeners();
  }

  void setActiveTool(AnnotationType tool) {
    _activeTool = tool;
    notifyListeners();
  }

  void goToPage(int page) {
    if (page < 0 || page >= _pageCount) return;
    _currentPage = page;
    notifyListeners();
  }

  void addAnnotation(Annotation annotation) {
    _pushUndo();
    _annotations.add(annotation);
    _redoStack.clear();
    notifyListeners();
  }

  void updateAnnotation(Annotation updated) {
    _pushUndo();
    final index = _annotations.indexWhere((a) => a.id == updated.id);
    if (index != -1) {
      _annotations[index] = updated;
      _redoStack.clear();
    }
    notifyListeners();
  }

  void deleteAnnotation(String id) {
    _pushUndo();
    _annotations.removeWhere((a) => a.id == id);
    _redoStack.clear();
    notifyListeners();
  }

  void undo() {
    if (_undoStack.isEmpty) return;
    _redoStack.add(_cloneAnnotations());
    final previous = _undoStack.removeLast();
    _annotations
      ..clear()
      ..addAll(previous);
    notifyListeners();
  }

  void redo() {
    if (_redoStack.isEmpty) return;
    _undoStack.add(_cloneAnnotations());
    final next = _redoStack.removeLast();
    _annotations
      ..clear()
      ..addAll(next);
    notifyListeners();
  }

  void close() {
    PdfService.instance.close();
    _document = null;
    _sourcePath = null;
    _pageCount = 0;
    _currentPage = 0;
    _annotations.clear();
    _undoStack.clear();
    _redoStack.clear();
    notifyListeners();
  }

  void _pushUndo() {
    _undoStack.add(_cloneAnnotations());
    if (_undoStack.length > 50) _undoStack.removeAt(0);
  }

  List<Annotation> _cloneAnnotations() =>
      _annotations.map((a) => Annotation.fromJson(a.toJson())).toList();
}
