# XCM-PDF Editor - Quick Reference Guide

**Leto's Angels Educational Project**  
**Developed by XcaliburMoon Web Development**

## Quick Start Commands

### Installation & Setup

**Windows:**
```
scripts\windows\install.bat
```

**Linux:**
```
./scripts/linux/install.sh
```

**macOS:**
```
./scripts/mac/install.sh
```

### Running the Application

**Windows:**
```
scripts\windows\run.bat
```

**Linux:**
```
./scripts/linux/run.sh
```

**macOS:**
```
./scripts/mac/run.sh
```

### Generate Example PDF

**Windows:**
```
scripts\windows\generate-pdf.bat
```

**Linux:**
```
./scripts/linux/generate-pdf.sh
```

**macOS:**
```
./scripts/mac/generate-pdf.sh
```

## Toolbar Reference

| Tool | Icon | Function |
|------|------|----------|
| Select | Cursor | Select and move annotations |
| Text | T | Add text annotations |
| Image | Picture | Insert images |
| Signature | Pen | Add digital signature |
| Highlight | Marker | Highlight text |
| Checkbox | Square | Add checkboxes |
| Date | Calendar | Insert current date |
| Delete | Trash | Remove selected element |

## Keyboard Shortcuts

- **Ctrl/Cmd + O** - Open PDF
- **Ctrl/Cmd + S** - Save PDF
- **Delete/Backspace** - Delete selected annotation
- **Arrow Keys** - Move selected annotation
- **+/-** - Zoom in/out
- **Page Up/Down** - Navigate pages

## File Operations

### Open PDF
1. Click "Open PDF" button in header
2. Select PDF file from your computer
3. Document loads in editor

### Save PDF
1. Make your edits/annotations
2. Click "Save" button in header
3. Choose save location
4. PDF saved with all modifications

### Merge PDFs
1. Click "Merge" button in header
2. Add multiple PDF files
3. Arrange order as needed
4. Click "Merge" to combine
5. Save merged document

## Digital Signatures

### Creating a Signature
1. Click Signature tool in toolbar
2. Draw signature in signature pad
3. Click "Apply" to place on document
4. Position signature where needed
5. Click to place

### Signature Features
- **Cryptographic signing** - RSA-PSS encryption
- **SHA-256 hashing** - Document integrity
- **Verification** - Validate signed documents
- **Tamper detection** - Security alerts

## Annotation Types

### Text Annotations
- Click Text tool
- Click on document where you want text
- Type your content
- Adjust font size and color
- Move/resize as needed

### Image Annotations
- Click Image tool
- Select image file
- Position on document
- Resize to fit

### Highlights
- Click Highlight tool
- Click and drag over text
- Choose highlight color
- Adjust transparency

### Checkboxes
- Click Checkbox tool
- Click where you want checkbox
- Use for forms and checklists

### Date Stamps
- Click Date tool
- Click where you want date
- Current date inserted automatically

## Tips for Participants

### Getting Started
1. Open the example PDF first (public/example-document.pdf)
2. Practice with each tool on Page 3 test area
3. Complete the sample form on Page 4
4. Save your practice document

### Best Practices
- Save frequently while editing
- Use Select tool to reposition elements
- Test digital signature before final use
- Keep original PDFs as backups
- Verify signed documents

### Common Tasks

**Filling Forms:**
1. Open PDF form
2. Use Text tool for text fields
3. Use Checkbox tool for options
4. Use Signature tool for signing
5. Use Date tool for dates
6. Save completed form

**Annotating Documents:**
1. Open document
2. Use Highlight for important sections
3. Use Text for comments/notes
4. Save annotated version

**Creating Multi-page Documents:**
1. Use Merge function
2. Add all required PDFs
3. Arrange in desired order
4. Merge and save

## Troubleshooting

### PDF Won't Load
- Check file is valid PDF format
- Try smaller file size
- Ensure browser supports PDF.js

### Signature Not Working
- Clear browser cache
- Check browser security settings
- Ensure Web Crypto API supported

### Annotations Not Saving
- Click Save button before closing
- Check browser download settings
- Verify sufficient storage space

### Slow Performance
- Close unnecessary browser tabs
- Use smaller PDF files
- Reduce image sizes before inserting

## Technical Support

For issues or questions:
- Check README.md for detailed documentation
- Review browser console for errors
- Ensure all dependencies installed
- Contact XcaliburMoon Web Development

## System Requirements

- Node.js 16 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)
- 2GB RAM minimum
- 100MB free storage

## File Locations

- Application: `/Users/mac/Documents/pdf-editor`
- Example PDF: `public/example-document.pdf`
- Dependencies: `node_modules/`
- Build output: `dist/`

## NPM Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run generate-example # Generate example PDF
```

---

**Version:** 1.0.0  
**Last Updated:** December 14, 2025  
**License:** MIT

**© 2025 XcaliburMoon Web Development**  
**Leto's Angels Educational Project**
