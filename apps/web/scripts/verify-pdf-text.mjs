// 用 pdfjs-dist 提取 PDF 文字,验证中文渲染(替代 UTF-16BE 字节搜索)
// Identity-H 子集化字体不会把 Unicode 原样写进 content stream,必须用 CMap 反查
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';

const file = process.argv[2] || 'D:\\code\\coding\\dl-resume\\verify-export.pdf';
const buf = new Uint8Array(fs.readFileSync(file));

const doc = await getDocument({ data: buf, useSystemFonts: false }).promise;
console.log('Pages:', doc.numPages);

let all = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const line = tc.items.map(it => it.str).join('');
  all += line + '\n';
  console.log(`--- page ${i} ---`);
  console.log(line);
}

const checks = ['张三', '高级前端工程师', '字节跳动', '主导创作者中心重构', '清华大学', 'TypeScript', '英语', '阅读'];
console.log('\n=== 中文渲染检查 ===');
for (const kw of checks) {
  console.log((all.includes(kw) ? '[OK]   ' : '[MISS] ') + kw);
}