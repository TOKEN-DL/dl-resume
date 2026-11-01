# 03: 题库数据层 —— 两张表 + 仓储

**What to build:** 题目能持久化落库：保存一套押题产生的题目、按条件查询、收藏切换、删除单题、删除整套。这一片交付的是「数据能被存取」，还不做界面。

两张表（来自设计文档 §3，编码了数据模型决策本身）：

```
QuestionSet —— 一次押题 = 一套
  id / userId / resumeId? / resumeTitle / provider / createdAt
  一套题必须能整体取回 —— 套级判重要按批次比重复率

QuestionItem —— 一道题
  id / userId / setId / resumeId? / resumeTitle
  question(题干) / answer(参考答案) / topic(考点)
  category(basic|deep) / difficulty(1-4) / fingerprint / starred / createdAt
  唯一约束 (userId, fingerprint)
```

两个关键取舍：

- **来源简历存字符串、不建外键** —— 简历被删了题还在，题是用户资产，不该跟着简历消失
- **`(userId, fingerprint)` 唯一索引** —— 把「同一道题只存一份」从应用层逻辑升级成数据库硬约束。即便两个确认请求并发、或某条代码路径绕过了判重，数据库也会挡住第二份。写入撞约束时**跳过该题并计为「重复」**，不报错。

仓储层要提供：写入整套、按用户列出、按条件筛选、收藏切换、删除单题、删除整套。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 迁移能在现有开发库上成功执行，两张表与索引齐全
- [ ] 仓储层提供写入整套、按用户列出、筛选、收藏切换、删除单题、删除整套
- [ ] 写入时命中 `(userId, fingerprint)` 唯一约束的题目被跳过并计入「重复数」，不抛错
- [ ] 仓储层单元测试按仓库现有的 mock Prisma 写法覆盖上述行为
- [ ] 题目与批次的查询都按用户隔离，跨用户不可见
- [ ] 领域类型（题目、批次、难度、分类）与 Prisma 模型同层产出，供后续组件直接使用
