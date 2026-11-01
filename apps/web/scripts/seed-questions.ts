/**
 * seed-questions —— 往题库里灌一组示例题(12 道),供演示与 E2E 使用。
 *
 * 用法:
 *   npx tsx scripts/seed-questions.ts --email <登录邮箱>
 *   npx tsx scripts/seed-questions.ts --id <用户 id>
 *   npx tsx scripts/seed-questions.ts                 # 库里只有一个用户时用它
 *
 * 可选参数:
 *   --title <套标题>        默认「示例简历 · 面试押题」
 *   --resume <简历标题>     挂到一份已有简历上(取不到就只存标题,题目不丢)
 *   --provider <引擎>       默认 local(本地兜底)
 *
 * 题目分布照设计文档 §5.2:4 档难度 × 3 题,基础/深挖各 6。
 * 写入走仓储层的 saveQuestionSet —— 撞 (userId, fingerprint) 唯一约束的题
 * **跳过而不是报错**,所以这个脚本可以反复跑。
 * 指纹用判重引擎的归一化(shared fingerprint),跟应用侧同一套规则,不会跑偏。
 */
import { prisma } from "../src/lib/prisma";
import { fingerprint } from "../src/lib/interview/fingerprint";
import { listQuestionItems, saveQuestionSet } from "../src/lib/interview/repo";

/** 一道示例题 */
interface SeedQuestion {
  question: string;
  answer: string;
  topic: string;
  category: "basic" | "deep";
  difficulty: 1 | 2 | 3 | 4;
}

/**
 * 12 道示例题 —— 分布照 §5.2:
 *   难度 1:基础 2 + 深挖 1    难度 2:基础 2 + 深挖 1
 *   难度 3:基础 1 + 深挖 2    难度 4:基础 1 + 深挖 2
 * 考点各不重复 —— 同考点会被判重规则当成「换皮问法」拦掉。
 */
const SAMPLE_QUESTIONS: SeedQuestion[] = [
  // ── 难度 1 · 入门理解 ──────────────────────────────────────
  {
    question: "介绍一下你负责的简历解析服务，它对外提供哪些接口？",
    answer:
      "对外是三个接口：POST /api/resumes/import 收文件、POST /api/resumes/import-json 收 JSON、" +
      "GET /api/resumes 列我自己的简历。解析在服务端做，文件先落到临时目录，再走 mammoth / pdfjs " +
      "抽文本，最后归一化成统一的 ResumeData 结构。",
    topic: "简历解析服务",
    category: "basic",
    difficulty: 1,
  },
  {
    question: "说说你用 TypeScript 和 Node.js 搭后端时，工程目录一般怎么分层？",
    answer:
      "按职责分三层：app/（路由与页面）、lib/（业务与仓储，prisma 访问都收在这一层）、components/（展示）。" +
      "路由里不直接写 prisma 调用，一律走 lib 下的仓储函数，这样换存储或者加缓存只动一处。",
    topic: "后端工程分层",
    category: "basic",
    difficulty: 1,
  },
  {
    question: "你简历里那个简历优化模块，用户提交后为什么不会中途卡住？前端是怎么知道跑到哪一步的？",
    answer:
      "因为优化是丢到后台任务里跑的，接口立刻返回 202，前端每 700ms 轮询一次任务状态。" +
      "任务表挂在 globalThis 上，切页面或关标签页都不影响；节点进度条按五个节点推进，" +
      "每个节点最短展示 420ms，避免出现「没节点在跑」的空档。",
    topic: "后台任务进度",
    category: "deep",
    difficulty: 1,
  },

  // ── 难度 2 · 熟练使用 ──────────────────────────────────────
  {
    question: "介绍一下 Prisma 的迁移流程，你平时怎么用它管理数据库变更？",
    answer:
      "开发期用 prisma migrate dev —— 它比对 schema 和现有迁移生成新的迁移文件并直接应用，" +
      "同时刷新 Prisma Client。生产用 prisma migrate deploy，只应用不生成。改字段我一律写迁移，" +
      "不手改数据库；破坏性改动（删列、改类型）先在迁移里做数据搬运再改结构。",
    topic: "数据库迁移",
    category: "basic",
    difficulty: 2,
  },
  {
    question: "说说 Next.js 里 Server Component 和 Client Component 的边界你是怎么划的。",
    answer:
      "默认全是 Server Component —— 页面壳、数据读取都在服务端渲染；只有真正需要交互的叶子组件" +
      "才加 use client，比如筛选条、拖拽编辑器。我的经验是：能用 props 传下去就别把整棵树变客户端，" +
      "客户端组件越多，首屏 JS 越大。",
    topic: "服务端组件边界",
    category: "basic",
    difficulty: 2,
  },
  {
    question: "你提到用 SSE 把优化进度推给前端，为什么选 SSE 而不是 WebSocket？",
    answer:
      "因为场景是单向的：只有服务端 → 客户端的进度，没有客户端 → 服务端的消息。SSE 自带断线重连，" +
      "走普通 HTTP 不需要额外协议，部署时不用额外开端口；WebSocket 得处理心跳和连接状态机，" +
      "收益跟成本不成比例。",
    topic: "进度推送选型",
    category: "deep",
    difficulty: 2,
  },

  // ── 难度 3 · 原理机制 ──────────────────────────────────────
  {
    question: "讲讲 JWT 登录态的签发与校验流程，密钥放在哪？",
    answer:
      "登录成功后用 jose 签一个 HS256 的 JWT，payload 里放 sub（用户 id）、email、isAdmin，" +
      "有效期 7 天，然后写进 HttpOnly 的 dl_session cookie，前端 JS 读不到。" +
      "每次请求由 getSession() 读 cookie 验签，验不过就当未登录。密钥来自 NEXTAUTH_SECRET 或 APP_SECRET，" +
      "只放环境变量，不进代码库。",
    topic: "会话签发校验",
    category: "basic",
    difficulty: 3,
  },
  {
    question: "简历数据在数据库里是加密存的，请讲讲密钥是怎么派生和保管的。",
    answer:
      "用用户密码派生 KEK（argon2 之后加盐拉伸），把每份简历的 DEK 用 KEK 加密后存进 encrypted_deks 表，" +
      "DEK 再拿去 AES-256-GCM 加密简历正文。表里存的是被包装过的密文，不是明文 KEK。" +
      "这样库里泄露了也拿不到简历，代价是密码改了得重新包装 DEK。",
    topic: "密钥派生保管",
    category: "deep",
    difficulty: 3,
  },
  {
    question: "你给押题接口做了判重，能讲讲相似度阈值是怎么定下来的吗？",
    answer:
      "三层：R1 归一化题干完全相同；R2 用字符 bigram 的 Jaccard 相似度，阈值 0.82；" +
      "R3 同考点直接判重 —— 模型常把同一个考点换个问法，文本相似度只有 0.3~0.5，靠 R2 抓不住，" +
      "让模型自己标 topic 等于先归一化了一次。另外套级再拦一道：跟既有套重复超过 55% 整套不入库，" +
      "但留了「仍要入库」的逃生口，避免误杀。",
    topic: "题目判重阈值",
    category: "deep",
    difficulty: 3,
  },

  // ── 难度 4 · 场景深挖 ──────────────────────────────────────
  {
    question: "AI 生成的简历内容要落到结构化字段里，你是怎么保证字段完整、不漏解析的？",
    answer:
      "不是直接相信模型输出。模型的 JSON 先过 extractJson —— 剥掉 <think> 思考块和 ```json 围栏，" +
      "再用配对花括号扫描把对象抠出来。抠出来后先跑 repairResumeData 抢救，缺字段补默认值、" +
      "类型不对就降级处理，非法结构也能救回一部分。最后仍然不把原文塞进去 —— 字段级拼装，" +
      "一次生成只覆盖它负责的模块。",
    topic: "字段完整落库",
    category: "basic",
    difficulty: 4,
  },
  {
    question: "如果模型返回的 JSON 不符合预期，你的兜底策略是什么？会不会静默丢字段？",
    answer:
      "不静默丢。抽取失败就报「模型没有生成出可解析的内容」，让用户看到失败而不是拿到半截数据。" +
      "结构能抠出来但个别字段缺失时，repairResumeData 会补上默认值，同时在界面上标注哪些是补的。" +
      "答案生成那条链路更严格：模型的 index 越界或缺失，那道题的答案就留空并标「参考答案生成失败」，" +
      "不猜也不编。",
    topic: "模型输出兜底",
    category: "deep",
    difficulty: 4,
  },
  {
    question: "题库里的题要保证同一道题只存一份，你的唯一性约束是怎么设计的？",
    answer:
      "应用层有 R1/R2/R3 三条规则，但那是逻辑，并发时可能同时插进去两条。所以底下还压了一条数据库唯一索引" +
      "（userId, fingerprint）：指纹是归一化题干取 sha1 前 16 位。写入撞了唯一约束就跳过这道题并计入重复数，" +
      "不抛错 —— 一道重复不影响同一套里其余的题入库。跨套也拦得住。",
    topic: "唯一性约束",
    category: "deep",
    difficulty: 4,
  },
];

/** 命令行参数 */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = value;
      i += 1;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // ── 找用户 ────────────────────────────────────────────────
  let user: { id: string; email: string; name: string } | null = null;
  if (args.id) {
    user = await prisma.user.findUnique({ where: { id: args.id } });
  } else if (args.email) {
    user = await prisma.user.findUnique({ where: { email: args.email } });
  } else {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
    if (users.length === 1) {
      [user] = users;
    } else if (users.length === 0) {
      console.error("[seed-questions] 库里还没有用户,先注册一个再灌题。");
      process.exit(1);
    } else {
      console.error("[seed-questions] 库里有多个用户,得指定用哪个:");
      for (const u of users) {
        console.error(`  --id ${u.id}    ${u.email}  (${u.name})`);
      }
      process.exit(1);
    }
  }

  if (!user) {
    console.error("[seed-questions] 找不到这个用户,检查一下 --id / --email。");
    process.exit(1);
  }

  // ── 挂到一份已有简历上(可选) ────────────────────────────────
  let resumeId: string | null = null;
  let resumeTitle = args.title || "示例简历 · 面试押题";
  if (args.resume) {
    const resume = await prisma.resume.findFirst({
      where: { userId: user.id, title: args.resume },
      orderBy: { updatedAt: "desc" },
    });
    if (resume) {
      resumeId = resume.id;
      resumeTitle = resume.title;
    } else {
      console.warn(`[seed-questions] 找不到标题为「${args.resume}」的简历,只存标题。`);
    }
  }

  // ── 已经灌过就别再灌一遍 ───────────────────────────────────
  const existing = await listQuestionItems(user.id);
  const existingFingerprints = new Set(existing.map((i) => i.fingerprint));
  const allPresent = SAMPLE_QUESTIONS.every((q) =>
    existingFingerprints.has(fingerprint(q.question)),
  );
  if (allPresent) {
    console.log("[seed-questions] 这 12 道示例题已经在题库里了,跳过。");
    return;
  }

  // ── 写入 ──────────────────────────────────────────────────
  const result = await saveQuestionSet({
    userId: user.id,
    resumeId,
    resumeTitle,
    provider: args.provider || "local",
    items: SAMPLE_QUESTIONS.map((q) => ({
      question: q.question,
      answer: q.answer,
      topic: q.topic,
      category: q.category,
      difficulty: q.difficulty,
      fingerprint: fingerprint(q.question),
    })),
  });

  console.log(
    `[seed-questions] 用户 ${user.email} 入库 ${result.inserted.length} 题` +
      (result.skipped > 0 ? `,跳过 ${result.skipped} 道重复题` : ""),
  );
  console.log(`[seed-questions] 套 id = ${result.set.id},来源简历 = ${resumeTitle}`);
  console.log("[seed-questions] 去 /questions 页面试题库。");
}

main()
  .catch((e) => {
    console.error("[seed-questions] error", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
