# #10 F16 导出 PDF(客户端)

**优先级**:P0 · **里程碑**:M2 · **预计**:2 天

## 验收

- 客户端 `@react-pdf/renderer` 基于当前模板渲染
- 导出文件 < 1MB,A4 矢量
- **中文不丢笔画**(字体子集化内置思源黑体 Regular)

## 子任务

- [ ] TDD:PDF 生成 snapshot 测试(用 `pdf-lib` 解析验证)
- [ ] 字体子集化脚本(`font-subset.ts`,使用 `subset-font` 工具)
- [ ] 思源黑体 Regular 子集 → 内置为 base64
- [ ] `exportPDF()` 函数:接收 `resume.data` + `template`,返回 Blob
- [ ] 下载触发: `<a download>` + URL.createObjectURL
- [ ] 中文渲染验证:测试用例包含中文长字段
- [ ] Playwright E2E:点击导出 → 文件下载 → 校验中文不丢失

## 风险(来自 PRD §5)

- @react-pdf/renderer 中文丢字(中概率/高影响)
- 缓解:`document.fonts.ready` 等待 + 字体子集化内置

## 关联

- **依赖**:F3(模板)、F4-F13(全部模块)
- **被依赖**:无