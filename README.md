# XCM-PDF Editor

This project started as a basic PDF tool and is now an active 2026 experiment in bridging practical PDF workflows with AI agentic automation.

A full-featured PDF Editor with crypto digital signing capabilities.

**Developed for:** Leto's Angels Educational Project  
**Developed by:** XcaliburMoon Web Development

## Features

- PDF viewing and editing
- Digital signature with cryptographic verification
- Text annotation and editing
- PDF merging capabilities
- Cross-platform support (Windows, macOS, Linux)
- Client-only architecture (no backend required)
- No API keys required for core functionality
- Self-host friendly for community training and deployment

## Project Mission

This project is a free community-focused tool for Leto's Angels and a public build platform for ongoing agent tooling.

- Help individuals complete fill-and-sign workflows when paid tools are not accessible
- Keep signing and verification local to the client by default
- Make self-hosting straightforward so participants can learn deployment basics
- Expand agentic task execution and bridge PDF workflows with automated toolchains as an essential 2026 direction

## Multi-User Server Readiness

If this project is hosted for multi-user operation, the architecture and implementation guidance now explicitly covers the following performance and scalability concepts.

1. Go concurrency plus optional C or C++ acceleration:
Go services should use goroutines, channels, and worker pools for multi-core scheduling. For targeted low-level hot paths, cgo-backed C or C++ modules can be used where profiling proves net gain.

2. Advanced memory management:
Allocation pressure should be controlled with object reuse, bounded queues, and allocator-aware design in critical paths. Garbage collection behavior should be tuned and validated against latency budgets.

3. Asynchronous I/O:
Network and storage operations should be non-blocking with bounded concurrency, backpressure, and timeout policies so high I/O demand does not stall request processing.

4. Sophisticated load balancing and horizontal scaling:
Deploy behind health-check-driven load balancing, keep services stateless where possible, and distribute workload to avoid hotspots and bottlenecks across instances.

5. Intelligent caching:
Use cache key strategy, TTL, and invalidation policy to reduce redundant data access and improve retrieval latency. Track cache hit rate and miss penalties.

6. Comprehensive profiling and modular scaling boundaries:
Use CPU, memory, and I/O profiling (for example, pprof and traces in Go services) for continuous tuning. Keep modules isolated so each component can be scaled and optimized independently.

## Prerequisites

- **Node.js** (version 16 or higher)
- **npm** (comes with Node.js)

### Installing Node.js

#### macOS/Linux
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts

# Or download from official website
# https://nodejs.org/
```

#### Windows
```
# Download installer from official website
https://nodejs.org/

# Or using nvm-windows
https://github.com/coreybutler/nvm-windows
```

## Quick Start

### Installation

#### macOS/Linux
```bash
chmod +x scripts/linux/install.sh scripts/linux/run.sh scripts/mac/install.sh scripts/mac/run.sh
./scripts/linux/install.sh   # Linux
./scripts/mac/install.sh     # macOS
```

#### Windows
```batch
scripts\windows\install.bat
```

### Running the Application

#### macOS/Linux
```bash
./scripts/linux/run.sh   # Linux
./scripts/mac/run.sh     # macOS
```

#### Windows
```batch
scripts\windows\run.bat
```

### Running Desktop App (Electron)

#### Windows
```batch
scripts\windows\run-desktop.bat
```

#### macOS/Linux
```bash
chmod +x scripts/linux/run-desktop.sh scripts/mac/run-desktop.sh
./scripts/linux/run-desktop.sh   # Linux
./scripts/mac/run-desktop.sh     # macOS
```

### Packaging Desktop App (Electron)

#### Windows
```batch
scripts\windows\package-desktop.bat
```

#### macOS/Linux
```bash
chmod +x scripts/linux/package-desktop.sh scripts/mac/package-desktop.sh
./scripts/linux/package-desktop.sh   # Linux
./scripts/mac/package-desktop.sh     # macOS
```

Desktop packages are written to the `release/` directory.

### Generate Example PDF

An example PDF document is included for testing and training purposes.

#### macOS/Linux
```bash
./scripts/linux/generate-pdf.sh   # Linux
./scripts/mac/generate-pdf.sh     # macOS
```

#### Windows
```batch
scripts\windows\generate-pdf.bat
```

The example PDF will be created at `public/example-document.pdf` and contains:
- Page 1: Project introduction and key features
- Page 2: Technical specifications and security features
- Page 3: User guide and practice areas
- Page 4: Sample participation form with signature fields

### Manual Commands

If you prefer to use npm directly:

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start desktop app in development mode (Electron + Vite)
npm run dev:electron

# Launch built desktop app
npm run electron

# Build for production
npm run build

# Create desktop packages
npm run pack
npm run pack:win
npm run pack:mac
npm run pack:linux

# Preview production build
npm run preview

# Generate example PDF
npm run generate-example

# Full coding requirements review + smoke test
npm run review
npm run review:strict
npm run review:advisory

# Focused review commands
npm run review:smoke
npm run review:smells
npm run review:security
npm run review:lines
npm run review:go
npm run review:pdo-pep
npm run review:complexity
npm run review:performance

# Promote dbl agent over main agent
npm run agent:promote

# Check agent/runtime progress snapshot
npm run agent:status

# Run review + progress check-in loop
npm run agent:checkin

# Generate README folder updates from mapped folder update files
npm run agent:readme:generate

# Strict check-in gate (fails on high findings)
npm run agent:checkin:strict
```

## Documentation

- Main docs index: `docs/FILE-INDEX.md`
- Quick reference: `docs/QUICK-REFERENCE.md`
- Participant guide: `docs/PARTICIPANT-GUIDE.md`
- Project summary: `docs/PROJECT-SUMMARY.md`
- Printable quick start card: `docs/QUICK-START-CARD.txt`

## Shared Auth Repository Link

This project is intended to share authentication and server-management building blocks with:

- `https://github.com/crissymoon/Live-CSS-Editor.git`

Local setup in this workspace links `xcm_auth` to:

- `C:\Users\criss\Desktop\dev_tools\page-builder\xcm_auth`

Use the shared push helper to push both repos in one step when they are clean and have commits ready:

```bash
npm run push:shared
```

## Code Review

The repository includes a coding requirements review toolkit under `code_review/`.

- Run strict review pipeline for CI: `npm run review` or `npm run review:strict`
- Run advisory review pipeline for local triage: `npm run review:advisory`
- Configure thresholds and ignores in: `code_review/config.json`
- Full report output: `code_review/reports/latest-review.json`
- Review toolkit docs: `code_review/README.md`

## Agent Runtime

The editor now includes a double-agent runtime with an in-app Agent Panel.

- Source architecture: `src/agent/`
- Promotion command: `npm run agent:promote`
- Progress snapshot command: `npm run agent:status`
- Check-in command for recurring progress reviews: `npm run agent:checkin`
- Runtime browser API: `window.xcmPdfAgents`

Use the check-in workflow regularly to track build readiness, review severity drift, and keep this tool easy to build on over time.

## Folder Update Map

Mapped per-folder update files can be used to regenerate this README section as work progresses.

- Map file: `scripts/agent/readme-folder-updates-map.json`
- Generator command: `npm run agent:readme:generate`

<!-- FOLDER_UPDATES:START -->
### Frontend and Editor Runtime
- Folder: src
- Update source: src/FOLDER-UPDATE.md
- Login gate UX was streamlined for compact username/password input handling.
- Password visibility now uses inline eye icons that visually blend into the input field.
- Autofill styling is normalized to prevent browser-specific yellow/blue background flashes.

### MCP Service and Tool Bridge
- Folder: mcp
- Update source: mcp/FOLDER-UPDATE.md
- MCP server work remains focused on stable tool invocation and provider interoperability.
- Ongoing effort targets lower friction between file tools, browser tools, and agent-driven workflows.
- 2026 focus is stronger task bridging so MCP actions chain cleanly into user-facing outcomes.

### Mobile Client
- Folder: mobile
- Update source: mobile/FOLDER-UPDATE.md
- Mobile app remains aligned with the core editor workflows while preserving Flutter portability.
- Current direction is tighter parity with desktop PDF fill-and-sign behavior.
- Planned updates prioritize reliability of signatures, forms, and cross-platform testing loops.

### Review and Quality Automation
- Folder: code_review
- Update source: code_review/FOLDER-UPDATE.md
- Review pipeline is active with strict and advisory profiles.
- Latest snapshots continue tracking medium-severity findings for prioritized cleanup.
- Check-in workflows are now wired to make progress drift visible during iterative development.

### CLI and Workflow Automation
- Folder: xcm_cli
- Update source: xcm_cli/FOLDER-UPDATE.md
- CLI workflows continue to support repeatable local automation for editor and tooling operations.
- Current emphasis is better command discoverability and smoother integration with agent routines.
- Next passes will expand task orchestration hooks for recurring check-ins and build handoffs.

### Project Documentation
- Folder: docs
- Update source: docs/FOLDER-UPDATE.md
- Core documentation covers project setup, quick reference, and participant guidance.
- Focus remains on accessibility and clarity for community learning and self-hosting.
- Planned work is tighter integration of agent runtime workflows into getting-started materials.

### AI Model Mock and Simulation
- Folder: mock_model_smoke
- Update source: mock_model_smoke/FOLDER-UPDATE.md
- Mock AI model and simulation tools are essential for testing agent workflows without live API dependencies.
- Current emphasis is stress testing and scenario fidelity for realistic agentic task traces.
- 2026 goal is stronger fixture generation and offline-first testing for PDF and MCP workflows.

### PDF Testing and Generation
- Folder: pdf_tests
- Update source: pdf_tests/FOLDER-UPDATE.md
- PDF generation utilities support both static example documents and randomized test fixtures.
- Recent work focuses on robust PDF structure generation for form-filling and signing validation.
- Ongoing effort expands test coverage for complex multi-page workflows and edge cases.
<!-- FOLDER_UPDATES:END -->

## Development

The application is built with:
- **Vite** - Fast build tool and dev server
- **TypeScript** - Type-safe JavaScript
- **PDF.js** - PDF rendering
- **pdf-lib** - PDF manipulation
- **Fabric.js** - Canvas manipulation for annotations

## Project Structure

```
pdf-editor/
├── public/             # Static assets
├── src/
│   ├── components/     # UI components
│   │   ├── MergeModal.ts
│   │   ├── SignaturePad.ts
│   │   └── TextEditor.ts
│   ├── styles/         # CSS styles
│   │   └── main.css
│   ├── types/          # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/          # Utility functions
│   │   ├── crypto.ts   # Cryptographic signing
│   │   ├── icons.ts    # Icon utilities
│   │   ├── pdf.ts      # PDF handling
│   │   └── toast.ts    # Notifications
│   ├── main.ts         # Application entry point
│   └── vite-env.d.ts   # Vite type definitions
├── index.html          # HTML entry point
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── vite.config.ts      # Vite configuration
├── electron/           # Electron main and preload process files
│   ├── main.cjs
│   └── preload.cjs
├── docs/               # Project documentation (except README)
│   ├── FILE-INDEX.md
│   ├── QUICK-REFERENCE.md
│   ├── PARTICIPANT-GUIDE.md
│   ├── PROJECT-SUMMARY.md
│   └── QUICK-START-CARD.txt
├── code_review/        # Coding requirements checks and smoke tests
│   ├── README.md
│   ├── review-core.mjs
│   ├── scripts/
│   │   ├── run-all.mjs
│   │   ├── smoke-test.mjs
│   │   ├── check-code-smells.mjs
│   │   ├── check-security.mjs
│   │   ├── check-file-lines.mjs
│   │   ├── check-go-funcs.mjs
│   │   ├── check-pdo-pep-templating.mjs
│   │   ├── check-complexity.mjs
│   │   └── check-performance-memory.mjs
│   └── reports/
├── scripts/            # OS-specific helper scripts
│   ├── windows/
│   │   ├── install.bat
│   │   ├── run.bat
│   │   ├── generate-pdf.bat
│   │   ├── run-desktop.bat
│   │   └── package-desktop.bat
│   ├── linux/
│   │   ├── install.sh
│   │   ├── run.sh
│   │   ├── generate-pdf.sh
│   │   ├── run-desktop.sh
│   │   └── package-desktop.sh
│   └── mac/
│       ├── install.sh
│       ├── run.sh
│       ├── generate-pdf.sh
│       ├── run-desktop.sh
│       └── package-desktop.sh
```

## Building for Production

```bash
npm run build
```

The production build will be created in the `dist/` directory.

## Preview Production Build

```bash
npm run preview
```

## License

MIT. You can do whatever you want with this source license, including commercial or private use, as long as you keep the MIT notice.

## Community Contribution

This project supports Leto's Angels community education work. Visit Leto's Angels and contribute at https://lainc.io/

## Support

For issues or questions, please contact XcaliburMoon Web Development.

---

**© 2026 XcaliburMoon Web Development**  
**Leto's Angels Educational Project**
