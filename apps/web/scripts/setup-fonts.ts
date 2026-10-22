/**
 * setup-fonts: 下载 PDF 端需要嵌入的中文字体到 public/fonts/。
 *
 * 预览端用 @fontsource / lxgw-wenkai-webfont(node_modules,不经过这里);
 * 这里只服务 react-pdf 的服务端渲染。
 *
 * Usage: npm run setup:fonts
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "fonts");

export interface FontFile {
  file: string;
  url: string;
  /** 小于该字节数视为下载不完整 */
  minBytes: number;
}

export const FONT_MANIFEST: FontFile[] = [
  {
    file: "NotoSansSC-Regular.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf",
    minBytes: 1_000_000,
  },
  {
    file: "NotoSansSC-Bold.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf",
    minBytes: 1_000_000,
  },
  {
    file: "NotoSerifSC-Regular.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf",
    minBytes: 1_000_000,
  },
  {
    file: "NotoSerifSC-Bold.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf",
    minBytes: 1_000_000,
  },
  {
    file: "LXGWWenKai-Regular.ttf",
    url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.520/LXGWWenKai-Regular.ttf",
    minBytes: 5_000_000,
  },
];

async function alreadyThere(f: FontFile): Promise<boolean> {
  try {
    const s = await stat(path.join(OUT_DIR, f.file));
    return s.size > f.minBytes;
  } catch {
    return false;
  }
}

async function download(f: FontFile): Promise<void> {
  console.log(`[setup-fonts] downloading ${f.file}`);
  const res = await fetch(f.url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`${f.file} 下载失败: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < f.minBytes) {
    throw new Error(`${f.file} 下载不完整: ${buf.length} 字节 < ${f.minBytes}`);
  }
  await writeFile(path.join(OUT_DIR, f.file), buf);
  console.log(`[setup-fonts] saved ${f.file} (${(buf.length / 1e6).toFixed(2)} MB)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of FONT_MANIFEST) {
    if (await alreadyThere(f)) {
      console.log(`[setup-fonts] skip ${f.file} (已存在)`);
      continue;
    }
    await download(f);
  }
  console.log("[setup-fonts] 全部字体就绪");
}

main().catch((e) => {
  console.error("[setup-fonts] error", e);
  process.exit(1);
});
