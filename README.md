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
chmod +x install.sh run.sh
./install.sh
```

#### Windows
```batch
install.bat
```

### Running the Application

#### macOS/Linux
```bash
./run.sh
```

#### Windows
```batch
run.bat
```

### Generate Example PDF

An example PDF document is included for testing and training purposes.

#### macOS/Linux
```bash
./generate-pdf.sh
```

#### Windows
```batch
generate-pdf.bat
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

# Build for production
npm run build

# Preview production build
npm run preview

# Generate example PDF
npm run generate-example
```

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
├── install.sh          # Linux/macOS installer
├── install.bat         # Windows installer
├── run.sh              # Linux/macOS run script
└── run.bat             # Windows run script
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

MIT

## Support

For issues or questions, please contact XcaliburMoon Web Development.

---

**© 2025 XcaliburMoon Web Development**  
**Leto's Angels Educational Project**
