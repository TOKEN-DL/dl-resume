# #17 题库数据层(两张表 + 仓储)

**优先级**:P0 · **里程碑**:M4 · **预计**:0.5 天

## 验收

- 一套押题产生的题目能落库,并按条件查询、收藏切换、删除单题、删除整套
- 同一道题在同一用户下只存一份(数据库级保证)
- 题目与批次按用户隔离,跨用户不可见

## 子任务

- [ ] Prisma model:QuestionSet + QuestionItem
- [ ] Prisma migration:两张表 + 索引 + 唯一约束
- [ ] TDD:仓储层(按仓库现有的 mock Prisma 写法)
- [ ] 写入命中唯一约束的题目被跳过并计入「重复数」,不抛错
- [ ] 领域类型(题目、批次、难度、分类)与 Prisma 模型同层产出

## 设计要点

### 两张表

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

### 两个关键取舍

- **来源简历存字符串、不建外键** —— 简历被删了题还在,题是用户资产,不该跟着简历消失
- **`(userId, fingerprint)` 唯一索引** —— 把「同一道题只存一份」从应用层逻辑升级成数据库硬约束。
  即便两个确认请求并发、或某条路径绕过了判重,数据库也会挡住第二份。
  写入撞约束时**跳过该题并计为「重复」**,不报错。

本项目此前禁止新增 Prisma 迁移(针对的是临时后台任务表);题库是长期数据,必须落库,故此处破例一次。

## 关联

- **依赖**:无
- **被依赖**:#18、#19、#21
