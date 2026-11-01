# Issues — 任务清单

> 本目录包含按 PRD 拆分的实现任务。每条对应一个独立 Git 分支 + 一组测试。
> 与 GitHub Issues 一一对应(本地副本)。

## 阶段划分

| 阶段 | 内容 | Issues |
|---|---|---|
| **M0 基础设施** | 脚手架能跑起来 | [#0](000-scaffold.md) |
| **M1 核心闭环**(US-1 完整路径)| 登录 → 简历列表 → 编辑器 → 模板切换 → 基础模块 | [#1, #2, #3, #4, #5, #6, #8] |
| **M2 完善** | 其余模块 + 自动保存 + PDF + JSON | [#7, #9, #10, #11] |
| **M3 生产化** | 加密 + 删除 + Docker | [#12, #13, #14] |
| **M4 AI 押题** | 面试押题 + 我的题库(PRD v1.3) | [#15, #16, #17, #18, #19, #20, #21, #22, #23, #24, #25] |

## 命名约定

- **分支**:`feat/<issue>-<short-slug>`(例 `feat/1-f1-auth`)
- **提交**:`feat(scope): message` 或 `test(scope): message`
- **PR 标题**:`#<issue> <description>`

## 工作流(每个 issue)

1. 从 main 切分支:`git checkout -b feat/<n>-<slug> main`
2. **TDD**:先写 Vitest 单测,跑红
3. **实现**:让测试通过
4. **E2E**:补 Playwright 用例(覆盖关键用户故事)
5. **本地验证**:`npm test` + `npm run build` + 手工跑一次
6. **提交**:`git commit -m "feat(...): ..."`
7. **合并**:`git checkout main && git merge --no-ff feat/<n>-<slug>`
8. **删除分支**:`git branch -d feat/<n>-<slug>`

## 进度追踪

- ⏳ 待开始:—
- 🚧 进行中:#25(端到端验证:Playwright 全链路)
- ✅ 完成:#0, #15, #16, #17, #18, #19, #20, #21, #22, #23, #24

> M4 阶段(面试押题 + 我的题库)已实现在集成分支 `feat/interview-question-bank` 上,
> 每片一个分支、一个提交,合并后统一推远端。设计正本见
> `docs/superpowers/specs/2026-11-01-interview-question-bank-design.md`。
