# XCM-PDF Editor - Project File Index

**Leto's Angels Educational Project**  
**Developed by XcaliburMoon Web Development**

---

## Installation & Setup Scripts

### Cross-Platform Installation
- **install.sh** - Installation script for macOS/Linux
- **install.bat** - Installation script for Windows
- **run.sh** - Run script for macOS/Linux
- **run.bat** - Run script for Windows
- **generate-pdf.sh** - PDF generation script for macOS/Linux
- **generate-pdf.bat** - PDF generation script for Windows

### Configuration Files
- **package.json** - Node.js dependencies and scripts
- **tsconfig.json** - TypeScript configuration
- **vite.config.ts** - Vite build configuration

---

## Documentation Files

### Main Documentation
- **README.md** - Complete project documentation
  - Project overview
  - Installation instructions
  - Usage guide
  - Development information
  - Build instructions

### User Guides
- **QUICK-REFERENCE.md** - Quick reference guide
  - Command reference
  - Toolbar guide
  - Keyboard shortcuts
  - Common tasks
  - Troubleshooting

- **PARTICIPANT-GUIDE.md** - Training guide for participants
  - Step-by-step setup
  - Training exercises
  - Real-world applications
  - Assessment checklist
  - Tips and best practices

- **FILE-INDEX.md** - This file
  - Complete file listing
  - File descriptions
  - Directory structure

---

## Application Files

### Entry Points
- **index.html** - HTML entry point
- **src/main.ts** - Application entry point (TypeScript)

### Components
- **src/components/MergeModal.ts** - PDF merge functionality
- **src/components/SignaturePad.ts** - Digital signature component
- **src/components/TextEditor.ts** - Text editing component

### Utilities
- **src/utils/crypto.ts** - Cryptographic signing utilities
- **src/utils/icons.ts** - Icon management
- **src/utils/pdf.ts** - PDF handling utilities
- **src/utils/toast.ts** - Notification system

### Styles
- **src/styles/main.css** - Main stylesheet (no emojis, no border radius)

### Types
- **src/types/index.ts** - TypeScript type definitions
- **src/vite-env.d.ts** - Vite environment types

---

## Example & Test Files

### Generated Content
- **generate-example-pdf.js** - Script to generate example PDF
- **public/example-document.pdf** - Example PDF for testing (7.9KB)
  - Page 1: Project introduction and features
  - Page 2: Technical specifications
  - Page 3: User guide and practice areas
  - Page 4: Sample participation form

---

## Directory Structure

```
pdf-editor/
├── public/
│   └── example-document.pdf        # Example PDF (generated)
│
├── src/
│   ├── components/
│   │   ├── MergeModal.ts           # PDF merge modal
│   │   ├── SignaturePad.ts         # Signature pad component
│   │   └── TextEditor.ts           # Text editor component
│   │
│   ├── styles/
│   │   └── main.css                # Main styles
│   │
│   ├── types/
│   │   └── index.ts                # Type definitions
│   │
│   ├── utils/
│   │   ├── crypto.ts               # Crypto utilities
│   │   ├── icons.ts                # Icon utilities
│   │   ├── pdf.ts                  # PDF utilities
│   │   └── toast.ts                # Toast notifications
│   │
│   ├── main.ts                     # App entry point
│   └── vite-env.d.ts               # Vite types
│
├── index.html                      # HTML entry point
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Vite config
│
├── install.sh                      # Install (macOS/Linux)
├── install.bat                     # Install (Windows)
├── run.sh                          # Run (macOS/Linux)
├── run.bat                         # Run (Windows)
├── generate-pdf.sh                 # Generate PDF (macOS/Linux)
├── generate-pdf.bat                # Generate PDF (Windows)
├── generate-example-pdf.js         # PDF generation script
│
├── README.md                       # Main documentation
├── QUICK-REFERENCE.md              # Quick reference
├── PARTICIPANT-GUIDE.md            # Training guide
└── FILE-INDEX.md                   # This file
```

---

## File Usage Guide

### For Installation
1. Run appropriate install script for your OS
2. Scripts will check Node.js, install dependencies

### For Running Application
1. Run appropriate run script for your OS
2. Application opens in browser at http://localhost:5173

### For Generating Example PDF
1. Run appropriate generate-pdf script
2. PDF created at `public/example-document.pdf`

### For Development
- Edit source files in `src/`
- Styles in `src/styles/main.css`
- Build using `npm run build`

### For Documentation
- Read README.md for complete overview
- Use QUICK-REFERENCE.md for quick lookups
- Follow PARTICIPANT-GUIDE.md for training

---

## NPM Scripts

All scripts defined in package.json:

```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build
npm run generate-example # Generate example PDF
```

---

## File Permissions

### Executable Files (chmod +x required on Unix systems)
- install.sh
- run.sh
- generate-pdf.sh

### Regular Files
- All .bat files (Windows)
- All .js, .ts, .json, .html, .css files
- All .md documentation files

---

## Dependencies

Listed in package.json:
- **@types/node** - Node.js type definitions
- **fabric** - Canvas manipulation
- **pdf-lib** - PDF generation and manipulation
- **pdfjs-dist** - PDF rendering
- **typescript** - TypeScript compiler
- **vite** - Build tool and dev server

---

## Build Output

After running `npm run build`:
- **dist/** directory created
- Contains production-ready files
- Ready for deployment

---

## Generated Files (Not in Version Control)

These files are created during use:
- node_modules/ - Installed dependencies
- dist/ - Production build
- package-lock.json - Dependency lock file
- public/example-document.pdf - Generated example PDF

---

## Design Principles

### Code Style
- No emojis in code or UI
- No border radius in CSS
- Clean, professional design
- TypeScript for type safety
- Modular component structure

### File Organization
- Clear separation of concerns
- Components in separate files
- Utilities organized by function
- Types defined centrally

---

## Version Information

- **Project:** XCM-PDF Editor
- **Version:** 1.0.0
- **License:** MIT
- **Created:** December 14, 2025
- **Developer:** XcaliburMoon Web Development
- **Client:** Leto's Angels Educational Project

---

## File Sizes (Approximate)

- **Total Source Code:** ~30KB
- **Example PDF:** 7.9KB
- **Documentation:** ~25KB
- **Scripts:** ~15KB
- **node_modules:** ~50MB (when installed)

---

## Maintenance Notes

### Regular Updates
- Check dependencies for security updates
- Update documentation as features change
- Regenerate example PDF if content changes
- Test scripts on all platforms

### Version Control
- Exclude node_modules/
- Exclude dist/
- Include all source files
- Include all documentation
- Include all scripts

---

**© 2025 XcaliburMoon Web Development**  
**Leto's Angels Educational Project**
