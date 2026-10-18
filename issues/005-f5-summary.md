# #5 F5 个人简介模块(TipTap 富文本)

**优先级**:P0 · **里程碑**:M1 · **预计**:1 天

## 验收

- 富文本(TipTap),支持加粗/列表/链接
- 富文本内容在预览中正确渲染

## 子任务

- [ ] 安装 TipTap: `@tiptap/react` `@tiptap/starter-kit` `@tiptap/extension-link`
- [ ] TDD:工具栏命令测试(序列化往返一致)
- [ ] 富文本编辑器组件(StarterKit + Link)
- [ ] HTML → PDF 兼容处理(@react-pdf/renderer 不支持所有 HTML)
- [ ] 写入 `Resume.data.summary`(HTML 字符串)

## 关联

- **依赖**:F3(预览渲染依赖模板)
- **被依赖**:无