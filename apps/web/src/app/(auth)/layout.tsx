import styles from "./auth.module.css";

/**
 * Auth pages layout — shared hero (left) + form (right).
 * Used by /login and /register.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles["auth-stage"]}>
      <section className={styles.hero}>
        <div className={styles["hero-inner"]}>
          <div className={styles.eyebrow}>RESUMÉ · v0.1 MVP</div>
          <h1 className={styles.title}>
            简历,<br />
            <em>真正</em>属于你。
          </h1>
          <p className={styles.sub}>
            一个面向中文求职者的开源简历系统。结构化分块编辑、实时预览、客户端
            PDF 导出。简历内容在服务端以 AES-256-GCM 加密——服务商看不到明文,
            数据主权完全在你手中。
          </p>
          <div className={styles.meta}>
            <span><b>03</b> 模板</span>
            <span><b>10</b> 模块</span>
            <span><b>≤300ms</b> 同步</span>
            <span><b>0</b> 明文</span>
          </div>
        </div>
      </section>
      <section className={styles["form-wrap"]}>{children}</section>
    </main>
  );
}