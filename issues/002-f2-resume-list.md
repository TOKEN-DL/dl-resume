# #2 F2 我的简历列表

**优先级**:P0 · **里程碑**:M1 · **预计**:1.5 天

## 验收

- 已创建简历的列表
- 支持新建/复制/重命名/删除
- 创建空简历后出现在列表
- 可重命名/删除

## 子任务

- [ ] TDD:简历 CRUD 仓库测试
- [ ] Prisma migration:Resume 模型(`id`、`userId`、`title`、`data`、`template`、`updatedAt`)
- [ ] `/api/resumes` GET(列表)、POST(新建)
- [ ] `/api/resumes/[id]` PATCH(重命名)、DELETE
- [ ] `/api/resumes/[id]/duplicate` POST
- [ ] `/resumes` 页面:卡片网格 + 新建按钮
- [ ] 卡片右上角 hover 显示重命名/复制/删除
- [ ] 删除走二次确认 modal

## 关联

- **依赖**:F1
- **被依赖**:F3-F13(进入编辑器时需要选简历)