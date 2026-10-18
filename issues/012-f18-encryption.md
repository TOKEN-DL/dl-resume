# #12 F18 服务端加密(AES-256-GCM)

**优先级**:P0 · **里程碑**:M3 · **预计**:2 天

## 验收

- 简历 JSON 用 AES-256-GCM 加密
- 密钥由用户密码派生(Argon2id → KEK)
- 数据库 dump 中看不到明文

## 子任务

- [ ] TDD:加密/解密单元测试(往返、篡改检测)
- [ ] TDD:密钥派生测试(同一密码 → 同一密钥)
- [ ] Node crypto 实现:
  - `deriveKEK(password, salt)` → 32 bytes
  - `encrypt(plaintext, kek)` → `{ iv, ciphertext, tag }`
  - `decrypt({ iv, ciphertext, tag }, kek)` → plaintext
- [ ] DEK(数据加密密钥)包装策略:
  - 首次注册:随机生成 DEK,用 KEK 包装存入数据库
  - 用户改密:用旧 KEK 解开 DEK,用新 KEK 重包
- [ ] Prisma migration:`EncryptedDek` 模型
- [ ] 服务端仓库层只在 `getResume()` 时解密
- [ ] E2E:数据库 dump 中 `data` 字段是 base64,无明文

## 风险(来自 PRD §5)

- 忘记密码 → 数据丢失(高/高)
- 缓解:见 #14 数据删除 + 管理员重置流程

## 关联

- **依赖**:F1(用户密码)
- **被依赖**:F19(删除需彻底擦除加密数据)