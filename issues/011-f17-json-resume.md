# #11 F17 JSON Resume 导入/导出

**优先级**:P0 · **里程碑**:M2 · **预计**:1 天

## 验收

- 符合 jsonresume.org schema
- 导出文件用 https://jsonresume.org/schema 验证通过
- 可与 Reactive Resume 等互通

## 子任务

- [ ] 安装 `jsonresume-schema` + `ajv`(JSON Schema 验证)
- [ ] TDD:导入映射测试(每个 schema 字段 → 内部 data 字段)
- [ ] TDD:导出符合 schema 测试
- [ ] `importJsonResume(file)` → 返回内部 data
- [ ] `exportJsonResume(data)` → 返回符合 schema 的 JSON
- [ ] UI:导入按钮 + 文件选择器 + 字段映射确认
- [ ] UI:导出按钮(整份 + 全部)
- [ ] 字段映射表(basics/work/education/skills/projects 等)

## 关联

- **依赖**:F2(导入生成新简历)
- **被依赖**:无