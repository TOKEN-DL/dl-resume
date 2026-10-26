/**
 * pdfjs worker 入口 —— 单独一个文件,只被 parse-pdf.ts 通过
 * `new Worker(new URL("./pdf-worker.ts", import.meta.url))` 引用。
 *
 * 必须独立成文件:webpack 只会把 `new URL(...)` 里指向的模块当作
 * worker chunk 打包,写在别处不起作用。
 *
 * 放在本地而不是 CDN —— 导入功能的核心承诺是"文件不出浏览器",
 * 连解析引擎都不该走外部网络。
 */
import "pdfjs-dist/build/pdf.worker.min.mjs";