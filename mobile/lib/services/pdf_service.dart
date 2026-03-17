import 'package:pdfrx/pdfrx.dart';

/// Thin service that wraps pdfrx document loading.
/// Both file-path and in-memory byte loading are exposed so that the
/// PDF viewer screen can stay agnostic about how the document was obtained.
class PdfService {
  PdfService._();
  static final PdfService instance = PdfService._();

  PdfDocument? _document;
  String? _sourcePath;

  PdfDocument? get document => _document;
  String? get sourcePath => _sourcePath;

  Future<PdfDocument> openFile(String path) async {
    await _document?.dispose();
    _document = await PdfDocument.openFile(path);
    _sourcePath = path;
    return _document!;
  }

  Future<PdfDocument> openData(List<int> data, {String? sourceName}) async {
    await _document?.dispose();
    _document = await PdfDocument.openData(data);
    _sourcePath = sourceName;
    return _document!;
  }

  Future<void> close() async {
    await _document?.dispose();
    _document = null;
    _sourcePath = null;
  }
}
