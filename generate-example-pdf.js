// XCM-PDF Editor - Example PDF Generator
// Leto's Angels Educational Project
// Developed by XcaliburMoon Web Development

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateExamplePDF() {
  console.log('========================================');
  console.log('XCM-PDF Editor - Example PDF Generator');
  console.log('Leto\'s Angels Educational Project');
  console.log('XcaliburMoon Web Development');
  console.log('========================================\n');

  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // Embed fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Define colors
  const titleColor = rgb(0.1, 0.2, 0.4);
  const headingColor = rgb(0.2, 0.3, 0.5);
  const bodyColor = rgb(0.2, 0.2, 0.2);
  const accentColor = rgb(0.3, 0.4, 0.6);
  const lightGray = rgb(0.95, 0.95, 0.95);

  // Page 1: Title and Introduction
  const page1 = pdfDoc.addPage([612, 792]); // US Letter size
  const { width, height } = page1.getSize();
  let yPosition = height - 100;

  // Header bar
  page1.drawRectangle({
    x: 0,
    y: height - 80,
    width: width,
    height: 80,
    color: titleColor,
  });

  // Title
  page1.drawText('XCM-PDF EDITOR', {
    x: 50,
    y: height - 50,
    size: 36,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  // Subtitle
  page1.drawText('Comprehensive PDF Editing & Digital Signing Solution', {
    x: 50,
    y: height - 72,
    size: 14,
    font: helveticaFont,
    color: rgb(0.9, 0.9, 0.9),
  });

  yPosition = height - 120;

  // Project info section
  page1.drawRectangle({
    x: 40,
    y: yPosition - 90,
    width: width - 80,
    height: 90,
    color: lightGray,
  });

  page1.drawText('DEVELOPED FOR:', {
    x: 50,
    y: yPosition - 25,
    size: 10,
    font: helveticaBold,
    color: headingColor,
  });

  page1.drawText('Leto\'s Angels Educational Project', {
    x: 50,
    y: yPosition - 42,
    size: 16,
    font: timesRomanBold,
    color: bodyColor,
  });

  page1.drawText('DEVELOPED BY:', {
    x: 50,
    y: yPosition - 65,
    size: 10,
    font: helveticaBold,
    color: headingColor,
  });

  page1.drawText('XcaliburMoon Web Development', {
    x: 50,
    y: yPosition - 82,
    size: 16,
    font: timesRomanBold,
    color: bodyColor,
  });

  yPosition -= 130;

  // Introduction section
  page1.drawText('INTRODUCTION', {
    x: 50,
    y: yPosition,
    size: 18,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const introText = [
    'Welcome to the XCM-PDF Editor demonstration document. This PDF serves multiple purposes:',
    '',
    '1. Testing and validating all features of the PDF editor',
    '2. Training participants in using the editor effectively',
    '3. Demonstrating digital signature capabilities',
    '4. Providing examples of various annotation types',
    '',
    'This document contains sample content designed to showcase the full range of editing',
    'capabilities, including text annotations, signature fields, checkboxes, and more.',
  ];

  introText.forEach((line) => {
    page1.drawText(line, {
      x: 50,
      y: yPosition,
      size: 11,
      font: timesRoman,
      color: bodyColor,
    });
    yPosition -= 16;
  });

  yPosition -= 15;

  // Key Features section
  page1.drawText('KEY FEATURES', {
    x: 50,
    y: yPosition,
    size: 18,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const features = [
    'PDF Viewing & Navigation - Browse through multi-page documents with ease',
    'Text Annotations - Add, edit, and position text anywhere on the document',
    'Digital Signatures - Cryptographically sign documents for authenticity',
    'Image Integration - Insert and position images within your PDFs',
    'Highlighting - Mark important text and sections',
    'Form Elements - Add checkboxes and other interactive elements',
    'Date Stamping - Insert current date for time-sensitive documents',
    'PDF Merging - Combine multiple PDF files into one document',
    'Export & Save - Save your edited PDFs with all modifications',
  ];

  features.forEach((feature) => {
    const parts = feature.split(' - ');
    page1.drawText('•', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: accentColor,
    });
    
    page1.drawText(parts[0], {
      x: 65,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: bodyColor,
    });

    if (parts[1]) {
      page1.drawText(' - ' + parts[1], {
        x: 65 + helveticaBold.widthOfTextAtSize(parts[0], 11),
        y: yPosition,
        size: 11,
        font: timesRoman,
        color: bodyColor,
      });
    }

    yPosition -= 18;
  });

  // Footer
  page1.drawText('Page 1 of 4', {
    x: width / 2 - 30,
    y: 30,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Page 2: Technical Specifications
  const page2 = pdfDoc.addPage([612, 792]);
  yPosition = height - 60;

  page2.drawText('TECHNICAL SPECIFICATIONS', {
    x: 50,
    y: yPosition,
    size: 24,
    font: helveticaBold,
    color: titleColor,
  });

  yPosition -= 40;

  // Technology Stack
  page2.drawText('Technology Stack', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const techStack = [
    'Frontend Framework: Vite + TypeScript',
    'PDF Rendering: PDF.js (Mozilla)',
    'PDF Manipulation: pdf-lib',
    'Canvas Editing: Fabric.js',
    'Cryptography: Web Crypto API',
    'Styling: Custom CSS (No frameworks)',
  ];

  techStack.forEach((tech) => {
    const parts = tech.split(': ');
    page2.drawText('•', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: accentColor,
    });

    page2.drawText(parts[0] + ':', {
      x: 65,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: bodyColor,
    });

    page2.drawText(' ' + parts[1], {
      x: 65 + helveticaBold.widthOfTextAtSize(parts[0] + ':', 11),
      y: yPosition,
      size: 11,
      font: timesRoman,
      color: bodyColor,
    });

    yPosition -= 18;
  });

  yPosition -= 15;

  // System Requirements
  page2.drawText('System Requirements', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const requirements = [
    'Node.js: Version 16 or higher',
    'Browser: Modern browser with ES2020 support',
    'Memory: Minimum 2GB RAM recommended',
    'Storage: 100MB for application and dependencies',
  ];

  requirements.forEach((req) => {
    const parts = req.split(': ');
    page2.drawText('•', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: accentColor,
    });

    page2.drawText(parts[0] + ':', {
      x: 65,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: bodyColor,
    });

    page2.drawText(' ' + parts[1], {
      x: 65 + helveticaBold.widthOfTextAtSize(parts[0] + ':', 11),
      y: yPosition,
      size: 11,
      font: timesRoman,
      color: bodyColor,
    });

    yPosition -= 18;
  });

  yPosition -= 15;

  // Platform Support
  page2.drawText('Platform Support', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const platforms = [
    'Windows: Full support via install.bat and run.bat scripts',
    'macOS: Full support via install.sh and run.sh scripts',
    'Linux: Full support via install.sh and run.sh scripts',
  ];

  platforms.forEach((platform) => {
    const parts = platform.split(': ');
    page2.drawText('•', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: accentColor,
    });

    page2.drawText(parts[0] + ':', {
      x: 65,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: bodyColor,
    });

    const descWidth = helveticaBold.widthOfTextAtSize(parts[0] + ':', 11);
    page2.drawText(' ' + parts[1], {
      x: 65 + descWidth,
      y: yPosition,
      size: 11,
      font: timesRoman,
      color: bodyColor,
    });

    yPosition -= 18;
  });

  yPosition -= 15;

  // Security Features
  page2.drawText('Security Features', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const securityFeatures = [
    'Digital signatures using RSA-PSS encryption',
    'SHA-256 hashing for document integrity verification',
    'Client-side cryptography (no server-side data transmission)',
    'Signature validation and verification',
    'Tamper detection for signed documents',
  ];

  securityFeatures.forEach((feature) => {
    page2.drawText('•', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: accentColor,
    });

    page2.drawText(feature, {
      x: 65,
      y: yPosition,
      size: 11,
      font: timesRoman,
      color: bodyColor,
    });

    yPosition -= 18;
  });

  // Footer
  page2.drawText('Page 2 of 4', {
    x: width / 2 - 30,
    y: 30,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Page 3: User Guide & Instructions
  const page3 = pdfDoc.addPage([612, 792]);
  yPosition = height - 60;

  page3.drawText('USER GUIDE', {
    x: 50,
    y: yPosition,
    size: 24,
    font: helveticaBold,
    color: titleColor,
  });

  yPosition -= 40;

  // Getting Started
  page3.drawText('Getting Started', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const gettingStarted = [
    '1. Installation',
    '   Run the appropriate installation script for your platform:',
    '   • Windows: install.bat',
    '   • macOS/Linux: ./install.sh',
    '',
    '2. Running the Application',
    '   Execute the run script:',
    '   • Windows: run.bat',
    '   • macOS/Linux: ./run.sh',
    '',
    '3. Opening a PDF',
    '   Click the "Open PDF" button to load a document for editing',
    '',
    '4. Using Tools',
    '   Select tools from the toolbar to add annotations, signatures, or other elements',
  ];

  gettingStarted.forEach((line) => {
    const indent = line.startsWith('   ') ? 20 : 0;
    const isBold = /^\d+\./.test(line.trim());

    page3.drawText(line.trim(), {
      x: 50 + indent,
      y: yPosition,
      size: 11,
      font: isBold ? helveticaBold : timesRoman,
      color: bodyColor,
    });

    yPosition -= 16;
  });

  yPosition -= 10;

  // Tool Descriptions
  page3.drawText('Tool Descriptions', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 25;

  const tools = [
    'Select Tool - Select and move existing annotations',
    'Text Tool - Add text annotations to the document',
    'Image Tool - Insert images into your PDF',
    'Signature Tool - Add your digital signature',
    'Highlight Tool - Highlight important text sections',
    'Checkbox Tool - Add interactive checkboxes',
    'Date Tool - Insert the current date',
  ];

  tools.forEach((tool) => {
    const parts = tool.split(' - ');
    page3.drawText('•', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: accentColor,
    });

    page3.drawText(parts[0], {
      x: 65,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: bodyColor,
    });

    const descWidth = helveticaBold.widthOfTextAtSize(parts[0], 11);
    page3.drawText(' - ' + parts[1], {
      x: 65 + descWidth,
      y: yPosition,
      size: 11,
      font: timesRoman,
      color: bodyColor,
    });

    yPosition -= 18;
  });

  yPosition -= 10;

  // Test Section Box
  page3.drawRectangle({
    x: 40,
    y: yPosition - 100,
    width: width - 80,
    height: 100,
    color: lightGray,
  });

  page3.drawText('TEST AREA FOR ANNOTATIONS', {
    x: 50,
    y: yPosition - 25,
    size: 14,
    font: helveticaBold,
    color: headingColor,
  });

  page3.drawText('Use this space to practice adding text, signatures, and other annotations.', {
    x: 50,
    y: yPosition - 45,
    size: 10,
    font: timesRoman,
    color: bodyColor,
  });

  page3.drawText('Try different tools and features to familiarize yourself with the editor.', {
    x: 50,
    y: yPosition - 62,
    size: 10,
    font: timesRoman,
    color: bodyColor,
  });

  // Footer
  page3.drawText('Page 3 of 4', {
    x: width / 2 - 30,
    y: 30,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Page 4: Sample Form & Practice Area
  const page4 = pdfDoc.addPage([612, 792]);
  yPosition = height - 60;

  page4.drawText('SAMPLE FORM', {
    x: 50,
    y: yPosition,
    size: 24,
    font: helveticaBold,
    color: titleColor,
  });

  yPosition -= 40;

  page4.drawText('Educational Project Participation Form', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: headingColor,
  });

  yPosition -= 35;

  // Form fields
  const formFields = [
    { label: 'Participant Name:', space: 40 },
    { label: 'Date:', space: 30 },
    { label: 'Project Name:', space: 40 },
    { label: 'Institution/Organization:', space: 40 },
  ];

  formFields.forEach((field) => {
    page4.drawText(field.label, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: bodyColor,
    });

    const labelWidth = helveticaBold.widthOfTextAtSize(field.label, 11);
    
    // Draw line for filling
    page4.drawLine({
      start: { x: 60 + labelWidth, y: yPosition - 2 },
      end: { x: width - 50, y: yPosition - 2 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });

    yPosition -= field.space;
  });

  yPosition -= 10;

  // Checkboxes section
  page4.drawText('Areas of Interest (check all that apply):', {
    x: 50,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: bodyColor,
  });

  yPosition -= 25;

  const interests = [
    'PDF Editing and Annotation',
    'Digital Signatures and Security',
    'Document Management',
    'Educational Technology',
    'Web Development',
  ];

  interests.forEach((interest) => {
    // Draw checkbox
    page4.drawRectangle({
      x: 55,
      y: yPosition - 3,
      width: 12,
      height: 12,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 1,
    });

    page4.drawText(interest, {
      x: 75,
      y: yPosition,
      size: 11,
      font: timesRoman,
      color: bodyColor,
    });

    yPosition -= 22;
  });

  yPosition -= 20;

  // Signature section
  page4.drawText('Digital Signature:', {
    x: 50,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: bodyColor,
  });

  yPosition -= 15;

  page4.drawRectangle({
    x: 50,
    y: yPosition - 60,
    width: 250,
    height: 60,
    borderColor: rgb(0.5, 0.5, 0.5),
    borderWidth: 1,
  });

  page4.drawText('(Use Signature Tool to sign here)', {
    x: 55,
    y: yPosition - 32,
    size: 9,
    font: helveticaFont,
    color: rgb(0.6, 0.6, 0.6),
  });

  yPosition -= 80;

  // Instructions box
  page4.drawRectangle({
    x: 40,
    y: yPosition - 80,
    width: width - 80,
    height: 80,
    color: rgb(0.95, 0.95, 1),
  });

  page4.drawText('INSTRUCTIONS FOR PARTICIPANTS', {
    x: 50,
    y: yPosition - 20,
    size: 12,
    font: helveticaBold,
    color: titleColor,
  });

  const instructions = [
    '1. Fill in all required fields using the Text Tool',
    '2. Check applicable boxes using the Checkbox Tool',
    '3. Add your digital signature in the signature box',
    '4. Save the completed form using the Save button',
  ];

  let instructionY = yPosition - 38;
  instructions.forEach((instruction) => {
    page4.drawText(instruction, {
      x: 50,
      y: instructionY,
      size: 9,
      font: timesRoman,
      color: bodyColor,
    });
    instructionY -= 14;
  });

  // Footer with project info
  page4.drawText('Page 4 of 4', {
    x: width / 2 - 30,
    y: 50,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  page4.drawText('XCM-PDF Editor - Leto\'s Angels Educational Project', {
    x: width / 2 - 160,
    y: 35,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  page4.drawText('Developed by XcaliburMoon Web Development', {
    x: width / 2 - 135,
    y: 22,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  
  // Create public directory if it doesn't exist
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const outputPath = path.join(publicDir, 'example-document.pdf');
  fs.writeFileSync(outputPath, pdfBytes);

  console.log('Success! Example PDF created at:');
  console.log(outputPath);
  console.log('\nThe PDF contains:');
  console.log('- Page 1: Project introduction and key features');
  console.log('- Page 2: Technical specifications and security features');
  console.log('- Page 3: User guide and practice areas');
  console.log('- Page 4: Sample participation form with signature fields');
  console.log('\nYou can now use this PDF to test the editor!\n');
  console.log('========================================\n');
}

generateExamplePDF().catch((error) => {
  console.error('Error generating PDF:', error);
  process.exit(1);
});
