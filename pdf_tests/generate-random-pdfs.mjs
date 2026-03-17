import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

function parseIntArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number.parseInt(raw.split('=')[1], 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseStringArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  return value ? value.trim() : fallback;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomColor() {
  return rgb(randFloat(0.05, 0.95), randFloat(0.05, 0.95), randFloat(0.05, 0.95));
}

function randomSentence(wordCount) {
  const words = [
    'merge', 'load', 'document', 'page', 'annotation', 'editor', 'quality', 'render', 'canvas', 'signature',
    'workflow', 'pipeline', 'review', 'upload', 'validate', 'batch', 'feature', 'screen', 'mobile', 'desktop',
    'performance', 'sample', 'random', 'stress', 'integration', 'export', 'tooling', 'history', 'undo', 'redo',
  ];

  const out = [];
  for (let i = 0; i < wordCount; i += 1) {
    out.push(words[randInt(0, words.length - 1)]);
  }

  const sentence = out.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

async function buildRandomPdf(index, minPages, maxPages) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageCount = randInt(minPages, maxPages);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const width = randInt(540, 900);
    const height = randInt(700, 1300);
    const page = pdfDoc.addPage([width, height]);

    const bg = rgb(randFloat(0.92, 1), randFloat(0.92, 1), randFloat(0.92, 1));
    page.drawRectangle({ x: 0, y: 0, width, height, color: bg });

    const headerColor = randomColor();
    page.drawRectangle({
      x: 24,
      y: height - 78,
      width: width - 48,
      height: 54,
      color: headerColor,
    });

    page.drawText(`Random PDF ${index.toString().padStart(3, '0')} | Page ${pageNumber}/${pageCount}`, {
      x: 32,
      y: height - 58,
      size: 14,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    let y = height - 110;
    for (let i = 0; i < randInt(8, 16); i += 1) {
      page.drawText(randomSentence(randInt(6, 14)), {
        x: 36,
        y,
        size: randInt(9, 14),
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= randInt(18, 24);
      if (y < 80) break;
    }

    const shapeCount = randInt(3, 9);
    for (let i = 0; i < shapeCount; i += 1) {
      const boxW = randInt(50, 180);
      const boxH = randInt(24, 120);
      const x = randInt(24, Math.max(24, width - boxW - 24));
      const yBox = randInt(40, Math.max(40, height - boxH - 120));

      page.drawRectangle({
        x,
        y: yBox,
        width: boxW,
        height: boxH,
        color: randomColor(),
        opacity: randFloat(0.12, 0.32),
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: randFloat(0.5, 1.5),
      });
    }

    page.drawText(`Generated: ${new Date().toISOString()}`, {
      x: 30,
      y: 24,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  return {
    bytes: await pdfDoc.save(),
    pageCount,
  };
}

async function main() {
  const count = Math.max(1, parseIntArg('count', 20));
  const minPages = Math.max(1, parseIntArg('min-pages', 1));
  const maxPages = Math.max(minPages, parseIntArg('max-pages', 10));
  const outputArg = parseStringArg('out', path.join('pdf_tests', 'generated'));
  const outputDir = path.resolve(process.cwd(), outputArg);

  await fs.mkdir(outputDir, { recursive: true });

  console.log('----------------------------------------');
  console.log('Random PDF Test Data Generator');
  console.log(`Output: ${outputDir}`);
  console.log(`Files: ${count}`);
  console.log(`Page range: ${minPages}-${maxPages}`);
  console.log('----------------------------------------');

  let totalPages = 0;

  for (let i = 1; i <= count; i += 1) {
    const { bytes, pageCount } = await buildRandomPdf(i, minPages, maxPages);
    totalPages += pageCount;

    const name = `random-${i.toString().padStart(3, '0')}-${pageCount}p.pdf`;
    const fullPath = path.join(outputDir, name);
    await fs.writeFile(fullPath, bytes);
    console.log(`[${i}/${count}] Wrote ${name}`);
  }

  console.log('----------------------------------------');
  console.log(`Done. Generated ${count} files with ${totalPages} total pages.`);
  console.log('Use these in load and merge workflows for stress/volume testing.');
}

main().catch((error) => {
  console.error('Failed to generate random test PDFs:', error);
  process.exitCode = 1;
});
