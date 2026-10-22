/**
 * 首页 —— 系统的门面。
 *
 * 布局:顶栏(SiteNav)+ 3D Hero + 特性网格 + 模板预览条 + 底部 CTA。
 * Hero 里那叠会转的纸是**真实模板渲染**(不是假缩略图),
 * 让访客第一眼看到的就是产品本身。
 */
import Link from "next/link";
import { getSession } from "@/lib/session";
import { listResumeSummaries } from "@/lib/resume-repo";
import { getTemplate, STYLE_GROUPS } from "@/lib/templates";
import { SiteNav } from "@/components/site-nav/site-nav";
import { HeroScene } from "@/components/home/hero-scene";
import { HomeCreateButton } from "@/components/home/home-create-button";
import { TiltCard } from "@/components/home/tilt-card";
import { TemplateThumb } from "@/components/templates/template-thumb";
import styles from "./home.module.css";

export const dynamic = "force-dynamic"; // 顶栏要读 session

/** Hero 里轮播的模板 —— 覆盖 5 种骨架,气质互不重复 */
const HERO_TEMPLATE_IDS = [
  "classic",
  "modern",
  "navy-elegant",
  "blue-corporate",
  "timeline-style",
];

/** 模板预览条 —— 挑 8 套风格差异最大的 */
const SHOWCASE_TEMPLATE_IDS = [
  "pure-minimal",
  "blue-corporate",
  "ink-brush",
  "dark-tech",
  "sakura",
  "elegant-serif",
  "creative-bold",
  "academic",
];

const FEATURES = [
  {
    icon: "▤",
    title: "结构化分块编辑",
    desc: "10 个模块分块编辑,不用跟一整页纯文本较劲。改哪块,改哪块。",
  },
  {
    icon: "◐",
    title: "实时预览",
    desc: "改一个字,A4 版面即时重排 —— 所见即所得,所见就是导出的那一份。",
  },
  {
    icon: "↓",
    title: "客户端 PDF",
    desc: "PDF 在浏览器里生成,数据不出本机,不上传第三方。",
  },
  {
    icon: "⬡",
    title: "端到端加密",
    desc: "AES-256-GCM 落库,服务端只存密文,密钥由你的密码派生。",
  },
];

const STATS = [
  { value: "82", label: "套模板" },
  { value: "10", label: "个模块" },
  { value: "≤300ms", label: "同步" },
  { value: "0", label: "明文存储" },
];

export default async function HomePage() {
  const session = await getSession();

  // 导航栏的「最近编辑」—— 只取元信息,不解密正文
  const recent = session
    ? (await listResumeSummaries(session.sub)).slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updatedAt.toISOString(),
      }))
    : [];

  const heroTemplates = HERO_TEMPLATE_IDS.map((id) => getTemplate(id));
  const showcase = SHOWCASE_TEMPLATE_IDS.map((id) => getTemplate(id));
  const groupLabels = new Map(STYLE_GROUPS.map((g) => [g.key, g.label]));

  return (
    <main className={styles.shell}>
      <SiteNav
        email={session?.email ?? null}
        isAdmin={session?.isAdmin}
        recent={recent}
      />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>OPEN SOURCE · RESUME SYSTEM</p>
          <h1 className={styles.title}>
            简历,<em>真正</em>属于你。
          </h1>
          <p className={styles.sub}>
            一个面向中文求职者的开源简历系统。结构化分块编辑、实时预览、客户端
            PDF 导出。简历内容在服务端以 AES-256-GCM 加密 —— 服务商看不到明文,
            数据主权完全在你手中。
          </p>
          <div className={styles.actions}>
            <HomeCreateButton
              signedIn={Boolean(session)}
              className={styles.btnPrimary}
            />
            <Link href="/templates" className={styles.btnGhost}>
              逛 82 套模板 →
            </Link>
            <Link href="/optimize" className={styles.btnGhost}>
              ✦ 智能体优化简历
            </Link>
          </div>
          <dl className={styles.stats}>
            {STATS.map((s) => (
              <div key={s.label} className={styles.stat}>
                <dt className={styles.statValue}>{s.value}</dt>
                <dd className={styles.statLabel}>{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={styles.heroScene}>
          <HeroScene templates={heroTemplates} />
        </div>
      </section>

      {/* ── 特性 ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>WHY IT HOLDS UP</p>
          <h2 className={styles.sectionTitle}>
            简历难的不是写,<em>是</em>一直写下去。
          </h2>
          <p className={styles.sectionSub}>
            我们把「简历」拆成能维护的模块,让迭代一份简历和改一条待办一样轻。
          </p>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <TiltCard key={f.title} className={styles.featureCard}>
              <span className={styles.featureIcon} aria-hidden="true">
                {f.icon}
              </span>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* ── 模板预览 ─────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.showcaseHead}>
          <div>
            <p className={styles.eyebrow}>TEMPLATE LIBRARY</p>
            <h2 className={styles.sectionTitle}>
              82 套模板,<em>各就各位</em>。
            </h2>
          </div>
          <Link href="/templates" className={styles.moreLink}>
            查看全部 82 套 →
          </Link>
        </div>
        <div className={styles.showcaseGrid}>
          {showcase.map((t) => (
            <Link
              key={t.id}
              href="/templates"
              className={styles.showcaseItem}
              title={t.name}
            >
              <div className={styles.showcaseThumb}>
                <TemplateThumb def={t} />
              </div>
              <div className={styles.showcaseMeta}>
                <span className={styles.showcaseName}>{t.name}</span>
                <span className={styles.showcaseGroup}>
                  {groupLabels.get(t.group) ?? t.group}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 底部 CTA ─────────────────────────────────────────── */}
      <section className={styles.ctaBand}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>
            把简历,<em>真正变成你的</em>。
          </h2>
          <p className={styles.ctaSub}>
            挑一套模板,填上你的经历,导出一份只属于你的 PDF。
          </p>
          <div className={styles.ctaActions}>
            <HomeCreateButton
              signedIn={Boolean(session)}
              className={styles.btnLight}
              label="立即创建简历"
            />
            <Link href="/templates" className={styles.btnOutline}>
              先看看模板
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.foot}>
        <span>简册 · 开源简历系统</span>
        <span className={styles.footLinks}>
          <Link href="/templates">模板广场</Link>
          <Link href="/resumes">我的简历</Link>
          <Link href="/settings">设置</Link>
        </span>
      </footer>
    </main>
  );
}
