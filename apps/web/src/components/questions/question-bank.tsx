"use client";

/**
 * QuestionBank —— 「我的题库」页的主体。
 *
 * 一条硬规则:**按批次分组**。一次押题 = 一套,组头显示来源简历、生成时间、题数,
 * 套里的题用共用的题卡组件渲染(题干常显、答案折叠)。
 *
 * 数据只有一条来路:/api/questions。页面打开时拉一次,收藏 / 删除直接回写同一个接口,
 * 回写成功后本地状态跟着变 —— 不做整页重载,免得删一题就把整屏刷掉。
 *
 * 题卡本身不归本文件管(那是 interview 目录下的公共组件),这里只负责分组、
 * 收藏回写、删除、空状态与筛选条。
 *
 * 筛选条件跟 URL 是一回事:条件写在 URL 的 query string 里,刷新页面还在,
 * 链接也能直接发给同事。方向只有一条 —— 用户改了筛选才写回 URL,
 * 外面改了 URL(前进后退 / 手改地址栏)才读回 state,两头不互相追。
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuestionCard } from "@/components/interview/question-card";
import { DIFFICULTY_LABELS } from "@/lib/interview/difficulty";
import styles from "./questions.module.css";

/** 一道题(与 /api/questions 的 items 元素同形) */
export interface QuestionBankItem {
  id: string;
  setId: string;
  resumeId: string | null;
  resumeTitle: string;
  question: string;
  answer: string;
  topic: string;
  category: string;
  difficulty: number;
  starred: boolean;
  createdAt: string;
}

/** 一套(与 /api/questions 的 sets 元素同形) */
export interface QuestionBankSet {
  id: string;
  resumeId: string | null;
  resumeTitle: string;
  provider: string;
  createdAt: string;
  count: number;
}

/**
 * 筛选条件 —— 与设计文档 §7 的查询参数一一对应。
 *
 * 只有筛选条上真正有的维度:来源简历 / 分类 / 难度 / 仅看收藏 / 关键词。
 * setId 是删整套时用的,不是筛选维度,不进 URL。
 */
interface BankFilters {
  resumeId: string;
  category: string;
  difficulty: string;
  starred: boolean;
  q: string;
}

const NO_FILTERS: BankFilters = {
  resumeId: "",
  category: "",
  difficulty: "",
  starred: false,
  q: "",
};

/** 合法的分类(与 /api/questions 的校验一致) */
const VALID_CATEGORIES = ["basic", "deep"];

/** 合法的难度档(与 /api/questions 的校验一致) */
const VALID_DIFFICULTIES = ["1", "2", "3", "4"];

/** 生成引擎的中文说法 */
function providerLabel(provider: string): string {
  if (provider === "minimax") return "MiniMax";
  if (provider === "local") return "本地兜底";
  return provider;
}

/** 难度档的中文说法 —— 与题卡组件共用同一份标签(difficulty.ts) */
const DIFFICULTY_OPTIONS: Array<[string, string]> = ([1, 2, 3, 4] as const).map((d) => [
  String(d),
  DIFFICULTY_LABELS[d],
]);

/** 时间戳 → 本地时间 "YYYY-MM-DD HH:mm" */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 把筛选条件拼成查询串(不含前导 ?)。
 *
 * 空值的维度不写进去 —— URL 短一点,发出去的请求也干净一点。
 * starred 只在为真时写;写 true 而不是 1,跟 /api/questions 能解析的形式对齐。
 *
 * 取值都先 trim —— 跟 parseFilters 对齐,保证 parseFilters(buildQuery(f)) === f。
 */
function buildQuery(filters: BankFilters): string {
  const qs = new URLSearchParams();
  const resumeId = filters.resumeId.trim();
  const category = filters.category.trim();
  const difficulty = filters.difficulty.trim();
  const q = filters.q.trim();
  if (resumeId) qs.set("resumeId", resumeId);
  if (category) qs.set("category", category);
  if (difficulty) qs.set("difficulty", difficulty);
  if (filters.starred) qs.set("starred", "true");
  if (q) qs.set("q", q);
  return qs.toString();
}

/**
 * 从查询串里读回筛选条件。
 *
 * 非法值一律当没给(回退默认值)—— 手捏的链接不该把页面搞崩,
 * 更不该让 /api/questions 直接 400。合法的取值跟接口的校验一一对齐:
 * 分类 basic/deep、难度 1~4、starred 认 true/1。
 */
function parseFilters(params: URLSearchParams): BankFilters {
  const category = (params.get("category") ?? "").trim();
  const difficulty = (params.get("difficulty") ?? "").trim();
  const starred = (params.get("starred") ?? "").trim().toLowerCase();
  return {
    ...NO_FILTERS,
    resumeId: (params.get("resumeId") ?? "").trim(),
    category: VALID_CATEGORIES.includes(category) ? category : "",
    difficulty: VALID_DIFFICULTIES.includes(difficulty) ? difficulty : "",
    starred: starred === "true" || starred === "1",
    q: (params.get("q") ?? "").trim(),
  };
}

/** 两套筛选条件是不是一回事 */
function sameFilters(a: BankFilters, b: BankFilters): boolean {
  return (
    a.resumeId === b.resumeId &&
    a.category === b.category &&
    a.difficulty === b.difficulty &&
    a.starred === b.starred &&
    a.q === b.q
  );
}

/** 把查询串拼到路径后面(没有查询串就只给路径) */
function withQuery(path: string, qs: string): string {
  return qs ? `${path}?${qs}` : path;
}

export function QuestionBank() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** URL 上的查询串 —— 拿字符串当依赖,对象身份不稳 */
  const qs = searchParams.toString();

  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [sets, setSets] = useState<QuestionBankSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * 筛选条件。
   *
   * 初值从 URL 里读 —— 刷新页面后条件还在,链接也能直接发给同事。
   * 之后只有「用户改了筛选」才动它,再把新条件写回 URL。
   */
  const [filters, setFilters] = useState<BankFilters>(() =>
    parseFilters(new URLSearchParams(qs)),
  );
  /** 搜索框里的字 —— 回车 / 点「筛选」才真正生效,边打字边查太吵 */
  const [keyword, setKeyword] = useState(() => filters.q);
  /**
   * 当前生效的筛选条件 —— 给回调和 effect 读最新值用。
   * effect 的依赖只有 qs,闭包里拿到的 filters 会是旧的,所以留一份 ref。
   */
  const filtersRef = useRef(filters);

  /** 把筛选条件写回 URL —— 用 replace,筛选不该往浏览器历史里塞一堆记录 */
  const writeUrl = useCallback(
    (next: BankFilters) => {
      const query = buildQuery(next);
      router.replace(withQuery(pathname, query), { scroll: false });
    },
    [pathname, router],
  );

  /** 改筛选条件:改 state + 写回 URL */
  const applyFilters = useCallback(
    (patch: Partial<BankFilters>) => {
      const next = { ...filtersRef.current, ...patch };
      // 条件没变就别折腾 —— 免得多打一次接口、多写一次 URL
      if (sameFilters(filtersRef.current, next)) return;
      filtersRef.current = next;
      setFilters(next);
      writeUrl(next);
    },
    [writeUrl],
  );

  /**
   * URL 变了 → 把条件读回 state。
   *
   * 这一趟**只读不写**:写 URL 的只有 applyFilters(用户主动改筛选)那一条路。
   * 所以「URL → state → URL」不会绕成圈 —— state 变了也不会回头写 URL。
   *
   * 顺带一提,parseFilters(buildQuery(f)) === f,所以自己写进去的那份 URL
   * 回来时解析出来的条件跟当前 state 一样,setFilters 直接原地返回,不会多打一次接口。
   */
  useEffect(() => {
    const next = parseFilters(new URLSearchParams(qs));
    const prevQ = filtersRef.current.q;
    filtersRef.current = next;
    setFilters((cur) => (sameFilters(cur, next) ? cur : next));
    // 生效的关键词变了,搜索框要跟上(前进后退 / 手改地址栏)
    if (prevQ !== next.q) setKeyword(next.q);
  }, [qs]);

  /** 拉列表。筛选条件一变就重拉 —— 题库按 userId 过滤,不需要分页兜底 */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(withQuery("/api/questions", buildQuery(filters)))
      .then(async (res) => {
        if (!res.ok) throw new Error("bad status");
        return (await res.json()) as { items?: QuestionBankItem[]; sets?: QuestionBankSet[] };
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setSets(data.sets ?? []);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("题库没拉下来,稍后再试一次。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  /**
   * 按批次分组。
   *
   * 组的顺序跟着 sets 走(接口按创建时间倒序给),接口没给到的套兜底成
   * 「未知来源」—— 宁可显示出来,也不悄悄把题吞掉。
   */
  const groups = useMemo(() => {
    const bySet = new Map<string, QuestionBankItem[]>();
    for (const item of items) {
      const bucket = bySet.get(item.setId);
      if (bucket) bucket.push(item);
      else bySet.set(item.setId, [item]);
    }
    const meta = new Map(sets.map((s) => [s.id, s]));
    const orderedIds = [
      ...sets.map((s) => s.id),
      ...Array.from(bySet.keys()).filter((id) => !meta.has(id)),
    ];
    return orderedIds
      .filter((id) => bySet.has(id))
      .map((id) => {
        const list = bySet.get(id) ?? [];
        const set = meta.get(id);
        return {
          set: set ?? {
            id,
            resumeId: null,
            resumeTitle: list[0]?.resumeTitle ?? "未知来源",
            provider: "unknown",
            createdAt: list[0]?.createdAt ?? "",
            count: list.length,
          },
          items: list,
        };
      });
  }, [items, sets]);

  /** 来源简历下拉的选项(从当前这批数据里收集) */
  const resumeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sets) if (s.resumeId) map.set(s.resumeId, s.resumeTitle);
    for (const it of items) if (it.resumeId) map.set(it.resumeId, it.resumeTitle);
    return Array.from(map, ([id, title]) => ({ id, title }));
  }, [sets, items]);

  /** 收藏 / 取消收藏 —— 先乐观翻转,接口失败再退回去 */
  const onStar = useCallback(async (item: QuestionBankItem, next: boolean) => {
    const previous = item.starred;
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, starred: next } : i)));
    try {
      const res = await fetch(`/api/questions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: next }),
      });
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { item?: Partial<QuestionBankItem> };
      if (data.item) {
        setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, ...data.item } : i)));
      }
      setError(null);
    } catch {
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, starred: previous } : i)));
      setError("收藏没存上,已经退回去了。");
    }
  }, []);

  /** 删单题 */
  const onDeleteItem = useCallback(async (item: QuestionBankItem) => {
    try {
      const res = await fetch(`/api/questions/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("bad status");
      setItems((cur) => cur.filter((i) => i.id !== item.id));
      // 题数跟着减;减到 0 的套就不占位置了
      setSets((cur) =>
        cur
          .map((s) =>
            s.id === item.setId ? { ...s, count: Math.max(0, s.count - 1) } : s,
          )
          .filter((s) => s.count > 0),
      );
      setError(null);
    } catch {
      setError("这道题没能删掉,再试一次。");
    }
  }, []);

  /** 删整套 */
  const onDeleteSet = useCallback(async (setId: string) => {
    try {
      const res = await fetch(`/api/questions?setId=${encodeURIComponent(setId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("bad status");
      setItems((cur) => cur.filter((i) => i.setId !== setId));
      setSets((cur) => cur.filter((s) => s.id !== setId));
      setError(null);
    } catch {
      setError("这一套没能删掉,再试一次。");
    }
  }, []);

  const hasFilter =
    Boolean(filters.resumeId) ||
    Boolean(filters.category) ||
    Boolean(filters.difficulty) ||
    filters.starred ||
    Boolean(filters.q);

  return (
    <div className={styles.bank}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.eyebrow}>INTERVIEW QUESTION BANK</p>
          <h1 className={styles.title}>我的题库</h1>
          <p className={styles.sub}>
            每押一次题就是一套,按批次堆在这里。想看的先自己答,答不上来再翻开参考答案。
          </p>
        </div>
        <Link href="/interview" className={styles.again}>
          再押一套
        </Link>
      </header>

      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters({ q: keyword.trim() });
        }}
      >
        <label className={styles.field}>
          <span className={styles.fieldLabel}>来源简历</span>
          <select
            className={styles.select}
            value={filters.resumeId}
            onChange={(e) => applyFilters({ resumeId: e.target.value })}
          >
            <option value="">全部简历</option>
            {resumeOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.title}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>分类</span>
          <select
            className={styles.select}
            value={filters.category}
            onChange={(e) => applyFilters({ category: e.target.value })}
          >
            <option value="">全部分类</option>
            <option value="basic">基础</option>
            <option value="deep">深挖</option>
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>难度</span>
          <select
            className={styles.select}
            value={filters.difficulty}
            onChange={(e) => applyFilters({ difficulty: e.target.value })}
          >
            <option value="">全部难度</option>
            {DIFFICULTY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={filters.starred}
            onChange={(e) => applyFilters({ starred: e.target.checked })}
          />
          <span>仅看收藏</span>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>关键词</span>
          <input
            className={styles.input}
            type="search"
            value={keyword}
            placeholder="题干 / 答案 / 考点"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </label>

        <button type="submit" className={styles.filterSubmit}>
          筛选
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {loading && items.length === 0 && <p className={styles.status}>正在加载题库…</p>}

      {!loading && !error && items.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{hasFilter ? "没有符合条件的题" : "题库还是空的"}</p>
          <p className={styles.emptyText}>
            {hasFilter
              ? "换个关键词或者把筛选条件放宽一点。"
              : "押一次题,题目会自动落进这里 —— 想复习的时候随时翻出来看。"}
          </p>
          {!hasFilter && (
            <Link href="/interview" className={styles.emptyCta}>
              去押一套
            </Link>
          )}
        </div>
      )}

      <div className={styles.groups}>
        {groups.map((group) => (
          <section
            key={group.set.id}
            className={styles.group}
            aria-label={group.set.resumeTitle}
          >
            <header className={styles.groupHead}>
              <div className={styles.groupText}>
                <h2 className={styles.groupTitle}>{group.set.resumeTitle}</h2>
                <p className={styles.groupMeta}>
                  <time className={styles.groupTime} dateTime={group.set.createdAt}>
                    {formatDateTime(group.set.createdAt)}
                  </time>
                  <span className={styles.groupSep} aria-hidden="true">
                    ·
                  </span>
                  <span className={styles.groupCount}>{group.set.count} 题</span>
                  <span className={styles.groupSep} aria-hidden="true">
                    ·
                  </span>
                  <span className={styles.groupProvider}>
                    {providerLabel(group.set.provider)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className={styles.groupDelete}
                onClick={() => void onDeleteSet(group.set.id)}
              >
                删掉这套
              </button>
            </header>

            <div className={styles.groupItems}>
              {group.items.map((item) => (
                <div key={item.id} className={styles.item}>
                  <QuestionCard
                    question={item.question}
                    answer={item.answer}
                    difficulty={item.difficulty}
                    category={item.category}
                    topic={item.topic}
                    starred={item.starred}
                    starMode="favorite"
                    onStarChange={(next) => void onStar(item, next)}
                  />
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.itemDelete}
                      onClick={() => void onDeleteItem(item)}
                    >
                      删掉这道题
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default QuestionBank;
