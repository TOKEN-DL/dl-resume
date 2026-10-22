# 字体说明

PDF 导出由 react-pdf 在服务端渲染,需要把中文字体嵌入到 PDF 里。
预览端不走这里 —— 预览用 `@fontsource/noto-sans-sc`、`@fontsource/noto-serif-sc`、
`lxgw-wenkai-webfont`(node_modules 里的 webfont),由浏览器按需加载。

## 字体文件(仅 PDF 端使用)

| 文件 | 字体族 | 说明 |
|---|---|---|
| `NotoSansSC-Regular.otf` | Noto Sans SC | 思源黑体简体 Regular |
| `NotoSansSC-Bold.otf` | Noto Sans SC | 思源黑体简体 Bold(真正的粗体字重) |
| `NotoSerifSC-Regular.otf` | Noto Serif SC | 思源宋体简体 Regular |
| `NotoSerifSC-Bold.otf` | Noto Serif SC | 思源宋体简体 Bold |
| `LXGWWenKai-Regular.ttf` | LXGW WenKai | 霞鹜文楷 Regular(无独立 Bold,700 复用此文件) |

来源:

- Noto CJK: <https://github.com/notofonts/noto-cjk>(`Sans/SubsetOTF/SC`、`Serif/SubsetOTF/SC`)
- 霞鹜文楷: <https://github.com/lxgw/LxgwWenKai/releases>(OFL-1.1)

## 获取方式

```bash
cd apps/web
npm run setup:fonts
```

脚本按 `scripts/setup-fonts.ts` 里的清单逐个下载,已存在且大小正常的文件会跳过(幂等)。
下载失败会以非 0 退出码结束 —— 构建期失败优于运行期失败。

## 为什么不在 git 里?

字体文件合计 60MB+,放进 git 会让仓库显著膨胀。按需下载即可。
react-pdf 在生成 PDF 时只嵌入用到的字形,**最终 PDF 体积不受源文件大小影响**。

## 缺字体时的表现

`src/lib/pdf/font.ts` 的 `registerFontsOnce()` 会在注册前检查文件是否齐全,
缺失时抛出中文可读错误:

```
字体资源缺失: NotoSerifSC-Bold.otf。请先运行 npm run setup:fonts 下载字体。
```

不会让 fontkit 抛出难懂的英文底层异常。

## Docker

`Dockerfile` 的 builder 阶段会执行 `npm run setup:fonts`,字体随镜像内置,
容器运行时无需联网。
