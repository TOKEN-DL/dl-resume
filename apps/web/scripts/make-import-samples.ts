/**
 * 生成 F20 导入功能的测试样本文件:
 *   samples/resume-sample.docx — 手工拼的最小 OOXML(验证 mammoth 路径)
 *   samples/resume-sample.pdf  — 用 pdf-lib 画的可选中文本(验证 pdfjs 路径)
 *
 * 只在本地跑,不进构建:
 *   npx tsx scripts/make-import-samples.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "samples");

const NAME = "Zhang Wei";
const BODY = [
  "Senior Frontend Engineer",
  "Phone: 13812345678",
  "Email: zhangwei@example.com",
  "Location: Shanghai",
  "GitHub: https://github.com/zhangwei",
  "",
  "WORK EXPERIENCE",
  "2020.07 - Present  ByteDance  Senior Frontend Engineer",
  "Led the creator platform rewrite.",
  "Migrated SSR stack to Next.js, cut LCP from 3.2s to 1.1s.",
  "2018.07 - 2020.06  Meituan  Frontend Engineer",
  "Built the merchant admin component library.",
  "",
  "EDUCATION",
  "2014.09 - 2018.06  Peking University  B.S. Computer Science",
  "GPA 3.8/4.0",
  "",
  "SKILLS",
  "Proficient in TypeScript, React, Next.js",
  "Familiar with Node.js, Webpack, Git",
  "",
  "LANGUAGES",
  "English: Native",
  "Japanese: Basic",
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function makeDocx() {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const paragraphs = [NAME, "", ...BODY]
    .map(
    (line) =>
      `<w:p>${line ? `<w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r>` : ""}</w:p>`,
  ).join("");

  zip.folder("word")!.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}</w:body>
</w:document>`,
  );

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const path = join(OUT_DIR, "resume-sample.docx");
  writeFileSync(path, buf);
  console.log("wrote", path, `${buf.length} bytes`);
}

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  let y = height - 70;

  page.drawText(NAME, { x: 50, y, size: 22, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 26;

  for (const line of BODY) {
    if (!line) {
      y -= 10;
      continue;
    }
    const isHeading = /^(WORK EXPERIENCE|EDUCATION|SKILLS|LANGUAGES)$/.test(line);
    const size = isHeading ? 12 : 9.5;
    const f = isHeading ? bold : font;
    if (isHeading) y -= 6;
    page.drawText(line, { x: 50, y, size, font: f, color: rgb(0.12, 0.15, 0.2) });
    y -= isHeading ? 18 : 14;
    if (y < 60) break;
  }

  const bytes = await doc.save();
  const path = join(OUT_DIR, "resume-sample.pdf");
  writeFileSync(path, bytes);
  console.log("wrote", path, `${bytes.length} bytes`, `(${width}x${height})`);
}

mkdirSync(OUT_DIR, { recursive: true });
makeDocx()
  .then(makePdf)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });