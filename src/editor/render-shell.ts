import { icons } from '../utils/icons';
import { setSanitizedHtml } from '../utils/safeHtml';

export function renderEditorShell(): void {
  const app = document.getElementById('app');
  if (!app) return;

  setSanitizedHtml(app, `
    <header class="header">
      <div class="header-brand">
        <div class="header-logo">XCM-PDF</div>
        <div class="header-subtitle">Leto's Angels Educational Project by XcaliburMoon</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" id="btn-new">
          ${icons.plus} New PDF
        </button>
        <button class="btn btn-secondary" id="btn-open">
          ${icons.upload} Open PDF
        </button>
        <button class="btn btn-secondary" id="btn-merge">
          ${icons.merge} Merge
        </button>
        <button class="btn btn-primary" id="btn-save" disabled>
          ${icons.save} Save
        </button>
      </div>
    </header>

    <div class="main-container">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <span>Pages</span>
          <span id="page-count">0 pages</span>
        </div>
        <div class="sidebar-content" id="thumbnail-container"></div>
      </aside>

      <div class="canvas-container">
        <div class="toolbar" id="toolbar">
          <div class="toolbar-group">
            <button class="btn btn-toolbar" id="tool-select" data-tool="select" title="Select">
              ${icons.select}
            </button>
          </div>

          <div class="toolbar-group">
            <button class="btn btn-toolbar" id="tool-text" data-tool="text" title="Add Text">
              ${icons.text}
            </button>
            <button class="btn btn-toolbar" id="tool-image" data-tool="image" title="Add Image">
              ${icons.image}
            </button>
            <button class="btn btn-toolbar" id="tool-signature" data-tool="signature" title="Add Signature">
              ${icons.signature}
            </button>
          </div>

          <div class="toolbar-group">
            <button class="btn btn-toolbar" id="tool-highlight" data-tool="highlight" title="Highlight: click and drag to highlight an area">
              ${icons.highlight}
            </button>
            <button class="btn btn-toolbar" id="tool-checkbox" data-tool="checkbox" title="Checkbox">
              ${icons.checkbox}
            </button>
            <button class="btn btn-toolbar" id="tool-date" data-tool="date" title="Insert Date">
              ${icons.calendar}
            </button>
          </div>

          <div class="toolbar-group">
            <button class="btn btn-toolbar" id="btn-delete" title="Delete Selected" disabled>
              ${icons.trash}
            </button>
          </div>

          <div class="toolbar-group">
            <button class="btn btn-toolbar" id="btn-undo" title="Undo (Ctrl+Z)" disabled>
              ${icons.undo}
            </button>
            <button class="btn btn-toolbar" id="btn-redo" title="Redo (Ctrl+Shift+Z)" disabled>
              ${icons.redo}
            </button>
          </div>

          <div class="toolbar-group zoom-controls">
            <button class="btn btn-toolbar btn-icon" id="btn-zoom-out" title="Zoom Out">
              ${icons.zoomOut}
            </button>
            <span class="zoom-value" id="zoom-value">100%</span>
            <button class="btn btn-toolbar btn-icon" id="btn-zoom-in" title="Zoom In">
              ${icons.zoomIn}
            </button>
          </div>

          <div class="toolbar-group page-nav">
            <button class="btn btn-toolbar btn-icon" id="btn-prev-page" title="Previous Page" disabled>
              ${icons.chevronLeft}
            </button>
            <input type="number" class="page-input" id="page-input" value="1" min="1">
            <span class="page-total" id="page-total">/ 0</span>
            <button class="btn btn-toolbar btn-icon" id="btn-next-page" title="Next Page" disabled>
              ${icons.chevronRight}
            </button>
          </div>
        </div>

        <div class="properties-bar" id="properties-bar" hidden>
          <span class="properties-bar-label" id="properties-bar-label">Color</span>
          <div class="properties-bar-swatches" id="properties-bar-swatches"></div>
          <span class="properties-bar-divider" id="properties-bar-divider" hidden></span>
          <label class="properties-bar-opacity-wrap" id="properties-bar-opacity-wrap" hidden>
            <span>Opacity</span>
            <input type="range" id="properties-bar-opacity" min="10" max="80" value="30">
            <span id="properties-bar-opacity-val">30%</span>
          </label>
          <div class="properties-bar-image-controls" id="properties-bar-image-controls" hidden>
            <span>Image size</span>
            <button class="btn btn-toolbar properties-chip" data-image-size-mode="auto">Auto</button>
            <button class="btn btn-toolbar properties-chip" data-image-size-mode="regular">Regular</button>
            <button class="btn btn-toolbar properties-chip" id="properties-bar-image-apply" hidden>Apply to selected</button>
          </div>
        </div>

        <div class="canvas-wrapper" id="canvas-wrapper">
          <div class="empty-state" id="empty-state">
            <div class="empty-state-icon">
              ${icons.pdf}
            </div>
            <h2 class="empty-state-title">No PDF Loaded</h2>
            <p class="empty-state-description">
              Open a PDF file to start editing, or merge multiple PDFs into one document.
            </p>
            <div class="drop-zone" id="drop-zone">
              <div style="margin-bottom: 8px;">${icons.upload}</div>
              <div style="font-weight: 500; margin-bottom: 4px;">Drop PDF file here</div>
              <div style="font-size: 12px; color: var(--color-gray-500);">or click to browse</div>
              <input type="file" id="file-input" class="hidden-input" accept=".pdf">
            </div>
          </div>

          <div class="pdf-canvas-container" id="pdf-container" style="display: none;">
            <canvas id="pdf-canvas" class="pdf-canvas"></canvas>
            <div class="annotation-layer" id="annotation-layer"></div>
          </div>
        </div>
      </div>
    </div>

    <footer class="status-bar">
      <div class="status-item">
        <span id="status-file">No file loaded</span>
      </div>
      <div class="status-item">
        <span id="status-info">XCM-PDF v1.0 - Free PDF Editor for Educational Use</span>
      </div>
    </footer>
  `);
}