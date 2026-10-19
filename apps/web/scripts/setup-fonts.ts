/**
 * setup-fonts: 下载 Noto Sans SC Regular 到 public/fonts/,
 * 供 react-pdf 在服务端渲染 PDF 时嵌入。
 *
 * Usage: npm run setup:fonts
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "fonts");
const FONT_FILE = path.join(OUT_DIR, "NotoSansSC-Regular.otf");
const URL = "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf";

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  try {
    const s = await stat(FONT_FILE);
    if (s.size > 1_000_000) {
      console.log(`[setup-fonts] already present (${(s.size/1e6).toFixed(2)} MB) → ${FONT_FILE}`);
      return;
    }
  } catch {
    /* missing — proceed to download */
  }

  console.log(`[setup-fonts] downloading from\n  ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) {
    console.error(`[setup-fonts] download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(FONT_FILE, buf);
  console.log(`[setup-fonts] saved (${(buf.length/1e6).toFixed(2)} MB) → ${FONT_FILE}`);
}

main().catch((e) => {
  console.error("[setup-fonts] error", e);
  process.exit(1);
});