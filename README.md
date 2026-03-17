# XCM-PDF Editor

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

This project is a free community-focused tool for Leto's Angels.

- Help individuals complete fill-and-sign workflows when paid tools are not accessible
- Keep signing and verification local to the client by default
- Make self-hosting straightforward so participants can learn deployment basics

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
- Runtime browser API: `window.xcmPdfAgents`

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
