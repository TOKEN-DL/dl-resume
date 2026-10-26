/**
 * F20 导入管线端到端验证(命令行版,比浏览器快得多)。
 *
 *   npx tsx scripts/verify-import.ts
 *
 * 读 samples/ 下的三个样本文件,走 parseResumeFile → resumeFromText,
 * 打印抽取结果。失败会以非 0 退出码结束。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseResumeFile, ImportError } from "../src/lib/import/parse-file";
import { resumeFromText } from "../src/lib/import/from-text";

const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "samples");

function toFile(path: string): File {
  const name = path.split(/[\\/]/).pop()!;
  const buf = readFileSync(path);
  return new File([new Uint8Array(buf)], name, {});
}

function brief(s: string, n = 60) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t || "(空)";
}

async function main() {
  const files = readdirSync(SAMPLES).filter((f) => /\.(md|pdf|docx|txt)$/i.test(f));
  if (files.length === 0) {
    console.error("samples/ 下没有样本文件,先跑 scripts/make-import-samples.ts");
    process.exit(1);
  }

  let failed = 0;

  for (const f of files) {
    const path = join(SAMPLES, f);
    console.log(`\n${"=".repeat(64)}\n${f}\n${"=".repeat(64)}`);
    try {
      const parsed = await parseResumeFile(toFile(path));
      const { data, diagnostics } = resumeFromText(parsed.text);

      console.log(`格式      ${parsed.format}  (${parsed.meta.charCount} 字${parsed.meta.pageCount ? ` / ${parsed.meta.pageCount} 页` : ""})`);
      console.log(`姓名      ${data.basics.name || "(未识别)"}`);
      console.log(`邮箱      ${data.basics.email || "(未识别)"}`);
      console.log(`电话      ${data.basics.phone || "(未识别)"}`);
      console.log(`求职意向  ${data.basics.label || "(未识别)"}`);
      console.log(`所在地    ${data.basics.location || "(未识别)"}`);
      console.log(`章节      ${diagnostics.sectionsFound.join(", ") || "(无)"}`);

      if (data.work.length) {
        console.log("工作经历:");
        for (const w of data.work) {
          console.log(
            `  · ${w.company} / ${w.position || "-"} / ${w.period.start || "?"}~${w.period.current ? "至今" : w.period.end || "?"}`,
          );
        }
      }
      if (data.education.length) {
        console.log("教育背景:");
        for (const e of data.education) {
          console.log(`  · ${e.school} / ${e.major || "-"} / ${e.degree || "-"} / ${e.period.start}~${e.period.end}`);
        }
      }
      if (data.projects.length) {
        console.log("项目经历:");
        for (const p of data.projects) {
          console.log(`  · ${p.name} / ${p.role || "-"} / ${p.url || "-"}`);
        }
      }
      if (data.skills.length) {
        console.log(`技能(${data.skills.length}): ${data.skills.slice(0, 8).map((s) => `${s.name}[${s.level}]`).join(" ")}`);
      }
      if (data.languages.length) {
        console.log(`语言: ${data.languages.map((l) => `${l.name}[${l.level}]`).join(" ")}`);
      }
      if (diagnostics.missingRequired.length) {
        console.log(`⚠ 未识别: ${diagnostics.missingRequired.join("、")}`);
      }
      console.log(`原文前 120 字: ${brief(parsed.text, 120)}`);
    } catch (e) {
      failed++;
      if (e instanceof ImportError) {
        console.log(`✗ 导入被拒绝 [${e.code}] ${e.message}`);
        console.log(`  提示: ${e.hint}`);
      } else {
        failed++;
        console.log(`✗ 非预期异常: ${(e as Error).message}`);
      }
    }
  }

  console.log(`\n处理 ${files.length} 个文件,失败 ${failed} 个`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});