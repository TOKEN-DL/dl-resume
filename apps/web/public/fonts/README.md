# 字体说明

PDF 渲染依赖 Noto Sans SC 思源黑体 Regular,用于中文不丢笔画。

## 字体文件

- `NotoSansSC-Regular.otf` — 思源黑体简体 Regular(~8.3MB,被 react-pdf 自动子集化嵌入 PDF)

## 获取方式

执行:

```bash
cd apps/web
npm run setup:fonts
```

会从 [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) 下载 SubsetOTF SC Regular 到 `public/fonts/`。

## 为什么不在 git 中?

字体文件 8MB+,放进 git 会让仓库显著膨胀。CI/clone 时按需下载即可。

## 切换字体

修改 `src/lib/pdf/font.ts` 中的 `fontPath`,可指向任何本地 OTF/TTF 路径。
Noto Sans SC 是推荐默认值;也支持替换为其他 CJK 字体(如思源宋体 Source Han Serif)。