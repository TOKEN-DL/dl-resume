/**
 * 编辑器各模块表单 — F4..F13.
 *
 * 每个 section 是受控组件:接 value + onChange,parent 拥有 state.
 */
"use client";

import { useRef } from "react";
import {
  Section,
  Field,
  TextInput,
  Textarea,
  Select,
  PeriodFields,
  ItemCard,
  AddButton,
} from "./section-shared";
import { TiptapEditor } from "./tiptap-editor";
import { newId } from "@/lib/validation/resume";
import type {
  ResumeData,
  Basics,
  EducationItem,
  WorkItem,
  ProjectItem,
  SkillItem,
  LanguageItem,
  AwardItem,
  CertificateItem,
} from "@/lib/validation/resume";
import styles from "./sections.module.css";

// ─── Basics (F4) ──────────────────────────────────────────────────────
export function BasicsSection({
  basics,
  onChange,
}: {
  basics: Basics;
  onChange: (next: Basics) => void;
}) {
  const set = (patch: Partial<Basics>) => onChange({ ...basics, ...patch });
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPickAvatar = () => fileRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) {
      alert("头像不能超过 500KB,请压缩");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ avatar: String(reader.result) });
    reader.readAsDataURL(f);
  };

  return (
    <Section title="基本信息" hint="F4">
      <div className={styles.row2}>
        <Field label="姓名" required>
          <TextInput value={basics.name} onChange={(e) => set({ name: e.target.value })} placeholder="张三" />
        </Field>
        <Field label="求职意向">
          <TextInput value={basics.label} onChange={(e) => set({ label: e.target.value })} placeholder="前端开发工程师" />
        </Field>
      </div>
      <div className={styles.row2}>
        <Field label="邮箱" required>
          <TextInput type="email" value={basics.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" />
        </Field>
        <Field label="电话">
          <TextInput value={basics.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="13800138000" />
        </Field>
      </div>
      <div className={styles.row3}>
        <Field label="性别">
          <Select value={basics.gender} onChange={(e) => set({ gender: e.target.value as Basics["gender"] })}>
            <option value="">不填</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </Select>
        </Field>
        <Field label="所在地">
          <TextInput value={basics.location} onChange={(e) => set({ location: e.target.value })} placeholder="北京" />
        </Field>
        <Field label="一句话简介">
          <TextInput value={basics.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="5 年前端,React/Vue" />
        </Field>
      </div>
      <Field label="头像" hint="仅本地 IndexedDB 存储,不会上传服务端。">
        <div className={styles.avatarRow}>
          {basics.avatar ? (
            <img src={basics.avatar} alt="avatar" className={styles.avatarPreview} />
          ) : (
            <div className={styles.avatarPlaceholder}>暂无头像</div>
          )}
          <div className={styles.avatarActions}>
            <button type="button" onClick={onPickAvatar} className={styles.actionBtn}>
              {basics.avatar ? "更换" : "上传"}
            </button>
            {basics.avatar && (
              <button type="button" onClick={() => set({ avatar: "" })} className={styles.actionBtnDanger}>
                移除
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFileChange} />
        </div>
      </Field>
    </Section>
  );
}

// ─── Summary (F5) 富文本 ──────────────────────────────────────────────
export function SummarySection({
  summary,
  onChange,
}: {
  summary: string;
  onChange: (next: string) => void;
}) {
  return (
    <Section title="个人简介" hint="F5 富文本">
      <TiptapEditor value={summary} onChange={onChange} placeholder="简要介绍自己的背景与优势…" minHeight={100} />
    </Section>
  );
}

// ─── Education (F6) ──────────────────────────────────────────────────
export function EducationSection({
  items,
  onChange,
}: {
  items: EducationItem[];
  onChange: (next: EducationItem[]) => void;
}) {
  const update = (i: number, patch: Partial<EducationItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  const add = () => onChange([...items, { id: newId("e"), school: "", degree: "", major: "", period: { start: "", end: "", current: false }, description: "" }]);

  return (
    <Section title="教育背景" hint={`F6 · ${items.length} 项`}>
      {items.map((it, i) => (
        <ItemCard
          key={it.id}
          title={it.school || "(未填写学校)"}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < items.length - 1}
        >
          <div className={styles.row2}>
            <Field label="学校" required>
              <TextInput value={it.school} onChange={(e) => update(i, { school: e.target.value })} placeholder="北京大学" />
            </Field>
            <Field label="学历">
              <TextInput value={it.degree} onChange={(e) => update(i, { degree: e.target.value })} placeholder="本科" />
            </Field>
          </div>
          <Field label="专业">
            <TextInput value={it.major} onChange={(e) => update(i, { major: e.target.value })} placeholder="计算机科学与技术" />
          </Field>
          <Field label="时间">
            <PeriodFields period={it.period} onChange={(p) => update(i, { period: { start: p.start ?? "", end: p.end ?? "", current: !!p.current } })} />
          </Field>
          <Field label="描述">
            <TiptapEditor value={it.description} onChange={(html) => update(i, { description: html })} placeholder="主修课程 / 绩点 / 获奖…" />
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={add} label="添加教育经历" />
    </Section>
  );
}

// ─── Work (F7) ───────────────────────────────────────────────────────
export function WorkSection({
  items,
  onChange,
}: {
  items: WorkItem[];
  onChange: (next: WorkItem[]) => void;
}) {
  const update = (i: number, patch: Partial<WorkItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  const add = () => onChange([...items, { id: newId("w"), company: "", position: "", period: { start: "", end: "", current: false }, description: "" }]);

  return (
    <Section title="工作经历" hint={`F7 · ${items.length} 项`}>
      {items.map((it, i) => (
        <ItemCard
          key={it.id}
          title={it.company || "(未填写公司)"}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < items.length - 1}
        >
          <div className={styles.row2}>
            <Field label="公司" required>
              <TextInput value={it.company} onChange={(e) => update(i, { company: e.target.value })} placeholder="字节跳动" />
            </Field>
            <Field label="职位">
              <TextInput value={it.position} onChange={(e) => update(i, { position: e.target.value })} placeholder="高级前端工程师" />
            </Field>
          </div>
          <Field label="时间">
            <PeriodFields period={it.period} onChange={(p) => update(i, { period: { start: p.start ?? "", end: p.end ?? "", current: !!p.current } })} />
          </Field>
          <Field label="描述">
            <TiptapEditor value={it.description} onChange={(html) => update(i, { description: html })} placeholder="职责 / 业绩 / 技术栈…" />
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={add} label="添加工作经历" />
    </Section>
  );
}

// ─── Projects (F8) ───────────────────────────────────────────────────
export function ProjectsSection({
  items,
  onChange,
}: {
  items: ProjectItem[];
  onChange: (next: ProjectItem[]) => void;
}) {
  const update = (i: number, patch: Partial<ProjectItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  const add = () => onChange([...items, { id: newId("p"), name: "", role: "", period: { start: "", end: "", current: false }, url: "", description: "" }]);

  return (
    <Section title="项目经历" hint={`F8 · ${items.length} 项`}>
      {items.map((it, i) => (
        <ItemCard
          key={it.id}
          title={it.name || "(未填写项目名)"}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < items.length - 1}
        >
          <div className={styles.row2}>
            <Field label="名称" required>
              <TextInput value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Resume Builder" />
            </Field>
            <Field label="角色">
              <TextInput value={it.role} onChange={(e) => update(i, { role: e.target.value })} placeholder="前端负责人" />
            </Field>
          </div>
          <div className={styles.row2}>
            <Field label="时间">
              <PeriodFields period={it.period} onChange={(p) => update(i, { period: { start: p.start ?? "", end: p.end ?? "", current: !!p.current } })} />
            </Field>
            <Field label="链接" hint="可空,例如 GitHub / 官网">
              <TextInput value={it.url ?? ""} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://github.com/..." />
            </Field>
          </div>
          <Field label="描述">
            <TiptapEditor value={it.description} onChange={(html) => update(i, { description: html })} placeholder="目标 / 技术栈 / 成果…" />
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={add} label="添加项目经历" />
    </Section>
  );
}

// ─── Skills (F9) ─────────────────────────────────────────────────────
const SKILL_LEVELS: Array<{ v: SkillItem["level"]; label: string }> = [
  { v: "beginner", label: "初" },
  { v: "intermediate", label: "中" },
  { v: "advanced", label: "高" },
  { v: "expert", label: "精通" },
];

export function SkillsSection({
  items,
  onChange,
}: {
  items: SkillItem[];
  onChange: (next: SkillItem[]) => void;
}) {
  const update = (i: number, patch: Partial<SkillItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  const add = () => onChange([...items, { id: newId("s"), name: "", level: "intermediate" }]);

  return (
    <Section title="专业技能" hint={`F9 · ${items.length} 项`}>
      {items.map((it, i) => (
        <ItemCard
          key={it.id}
          title={it.name || "(未填写技能)"}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < items.length - 1}
        >
          <Field label="技能名" required>
            <TextInput value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="TypeScript" />
          </Field>
          <Field label="熟练度">
            <div className={styles.levelRow}>
              {SKILL_LEVELS.map((lv, n) => (
                <button
                  key={lv.v}
                  type="button"
                  title={lv.label}
                  className={
                    ["beginner", "intermediate", "advanced", "expert"].indexOf(it.level ?? "") >= n
                      ? `${styles.dot} ${styles.dotActive}`
                      : styles.dot
                  }
                  onClick={() => update(i, { level: lv.v })}
                />
              ))}
              <span className={styles.levelLabel}>
                {SKILL_LEVELS.find((l) => l.v === (it.level ?? "intermediate"))?.label}
              </span>
            </div>
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={add} label="添加技能" />
    </Section>
  );
}

// ─── Languages (F10) ─────────────────────────────────────────────────
const LANG_LEVELS: Array<{ v: LanguageItem["level"]; label: string }> = [
  { v: "", label: "不填" },
  { v: "A1", label: "A1" },
  { v: "A2", label: "A2" },
  { v: "B1", label: "B1" },
  { v: "B2", label: "B2" },
  { v: "C1", label: "C1" },
  { v: "C2", label: "C2" },
  { v: "native", label: "母语" },
];

export function LanguagesSection({
  items,
  onChange,
}: {
  items: LanguageItem[];
  onChange: (next: LanguageItem[]) => void;
}) {
  const update = (i: number, patch: Partial<LanguageItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  const add = () => onChange([...items, { id: newId("l"), name: "", level: "" }]);

  return (
    <Section title="语言能力" hint={`F10 · ${items.length} 项`}>
      {items.map((it, i) => (
        <ItemCard
          key={it.id}
          title={it.name || "(未填写语言)"}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < items.length - 1}
        >
          <div className={styles.row2}>
            <Field label="语言" required>
              <TextInput value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="英语" />
            </Field>
            <Field label="等级">
              <Select
                value={it.level ?? ""}
                onChange={(e) => update(i, { level: e.target.value as LanguageItem["level"] })}
              >
                {LANG_LEVELS.map((lv) => (
                  <option key={lv.v || "none"} value={lv.v}>{lv.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </ItemCard>
      ))}
      <AddButton onClick={add} label="添加语言" />
    </Section>
  );
}

// ─── Awards (F11) ────────────────────────────────────────────────────
export function AwardsSection({
  items,
  onChange,
}: {
  items: AwardItem[];
  onChange: (next: AwardItem[]) => void;
}) {
  const update = (i: number, patch: Partial<AwardItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  const add = () => onChange([...items, { id: newId("a"), title: "", awarder: "", date: "", description: "" }]);

  return (
    <Section title="荣誉奖项" hint={`F11 · ${items.length} 项`}>
      {items.map((it, i) => (
        <ItemCard
          key={it.id}
          title={it.title || "(未填写奖项)"}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < items.length - 1}
        >
          <div className={styles.row2}>
            <Field label="奖项名" required>
              <TextInput value={it.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="ACM 金奖" />
            </Field>
            <Field label="颁发方">
              <TextInput value={it.awarder} onChange={(e) => update(i, { awarder: e.target.value })} placeholder="ACM 协会" />
            </Field>
          </div>
          <div className={styles.row2}>
            <Field label="时间">
              <TextInput value={it.date} onChange={(e) => update(i, { date: e.target.value })} placeholder="2024-05" />
            </Field>
          </div>
          <Field label="描述">
            <Textarea rows={2} value={it.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="简述…" />
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={add} label="添加奖项" />
    </Section>
  );
}

// ─── Certificates (F12) ─────────────────────────────────────────────
export function CertificatesSection({
  items,
  onChange,
}: {
  items: CertificateItem[];
  onChange: (next: CertificateItem[]) => void;
}) {
  const update = (i: number, patch: Partial<CertificateItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  const add = () => onChange([...items, { id: newId("c"), name: "", issuer: "", date: "" }]);

  return (
    <Section title="证书" hint={`F12 · ${items.length} 项`}>
      {items.map((it, i) => (
        <ItemCard
          key={it.id}
          title={it.name || "(未填写证书)"}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < items.length - 1}
        >
          <div className={styles.row3}>
            <Field label="证书名" required>
              <TextInput value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="AWS SAA" />
            </Field>
            <Field label="颁发机构">
              <TextInput value={it.issuer} onChange={(e) => update(i, { issuer: e.target.value })} placeholder="Amazon" />
            </Field>
            <Field label="获得时间">
              <TextInput value={it.date} onChange={(e) => update(i, { date: e.target.value })} placeholder="2024-08" />
            </Field>
          </div>
        </ItemCard>
      ))}
      <AddButton onClick={add} label="添加证书" />
    </Section>
  );
}

// ─── Interests (F13) ─────────────────────────────────────────────────
export function InterestsSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Section title="兴趣爱好" hint="F13 短文本,支持多行">
      <Textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder="例如:阅读、跑步、桌游…" />
    </Section>
  );
}

// ─── 一站式 wrapper ─────────────────────────────────────────────────
export function ResumeForm({
  data,
  onChange,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
}) {
  const set = (patch: Partial<ResumeData>) => onChange({ ...data, ...patch });
  return (
    <>
      <BasicsSection basics={data.basics} onChange={(b) => set({ basics: b })} />
      <SummarySection summary={data.summary} onChange={(s) => set({ summary: s })} />
      <EducationSection items={data.education} onChange={(e) => set({ education: e })} />
      <WorkSection items={data.work} onChange={(w) => set({ work: w })} />
      <ProjectsSection items={data.projects} onChange={(p) => set({ projects: p })} />
      <SkillsSection items={data.skills} onChange={(s) => set({ skills: s })} />
      <LanguagesSection items={data.languages} onChange={(l) => set({ languages: l })} />
      <AwardsSection items={data.awards} onChange={(a) => set({ awards: a })} />
      <CertificatesSection items={data.certificates} onChange={(c) => set({ certificates: c })} />
      <InterestsSection value={data.interests} onChange={(i) => set({ interests: i })} />
    </>
  );
}