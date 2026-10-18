# #9 F15 自动保存

**优先级**:P0 · **里程碑**:M2 · **预计**:1 天

## 验收

- 编辑期间每 5s 防抖写入 IndexedDB
- 切换路由或关闭前写入服务端
- 刷新页面不丢数据

## 子任务

- [ ] TDD:debounce + IndexedDB 读写测试
- [ ] `useLocalDraft` hook(idb-keyval + debounce 5s)
- [ ] `beforeunload` 事件:触发立即保存到服务端
- [ ] 服务端 `/api/resumes/[id]` PATCH 用于路由切换时的最终保存
- [ ] 编辑器顶部"已保存/保存中/未保存"指示器
- [ ] 重新打开编辑器时优先用 IndexedDB 数据(更近)覆盖服务端

## 关联

- **依赖**:F14
- **被依赖**:无