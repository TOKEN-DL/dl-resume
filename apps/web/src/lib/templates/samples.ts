import type { ResumeData } from "@/lib/validation/resume";

/**
 * 模板范文 —— 三份基线简历。
 *
 * 为什么只有三份而不是三十二份:
 * 32 份完整数据要维护 32 遍相同结构的文字,成本高且容易前后不一致;
 * 而画廊真正需要的是「每套模板都有真实内容撑满版面」。
 * 所以这里维护 3 份基线(通用工作型 / 学生型 / 创意设计型),
 * 各模板在注册表里引用其中一份,再按需要微调个别字段。
 */

export const SAMPLE_PROFESSIONAL: ResumeData = {
  basics: {
    name: "陈默",
    label: "高级前端工程师",
    email: "chenmo@example.com",
    phone: "138-0000-0000",
    gender: "male",
    location: "上海 · 徐汇",
    avatar: "",
    summary: "六年前端经验,专注中后台架构与性能优化,带过 8 人团队。",
  },
  summary:
    "<p>六年前端开发经验,长期负责中后台与数据可视化方向。熟悉 <strong>React / TypeScript</strong> 技术栈,主导过两次微前端改造,把首屏加载从 3.2s 降到 1.1s。习惯用工程化手段解决问题,交付节奏稳定。</p>",
  work: [
    {
      id: "wp1",
      company: "星云科技",
      position: "高级前端工程师",
      period: { start: "2022-03", end: "", current: true },
      description:
        "<p>负责企业级中后台产品的前端架构与性能优化。</p><ul><li>主导微前端改造,首屏加载从 3.2s 降至 1.1s,跳出率下降 18%</li><li>沉淀 12 个业务组件,跨团队复用率提升到 65%</li><li>搭建前端监控体系,线上问题平均定位时间从 2 小时缩短到 15 分钟</li></ul>",
    },
    {
      id: "wp2",
      company: "云图数据",
      position: "前端工程师",
      period: { start: "2020-07", end: "2022-02", current: false },
      description:
        "<p>负责数据可视化平台的前端开发。</p><ul><li>基于 Canvas 自研图表渲染层,支撑单页 10 万数据点流畅交互</li><li>推动项目从 jQuery 迁移到 React,交付效率提升约 40%</li></ul>",
    },
    {
      id: "wp3",
      company: "拾光互联",
      position: "前端开发实习生",
      period: { start: "2019-03", end: "2019-08", current: false },
      description:
        "<p>参与电商后台管理系统的页面开发与联调,独立完成 20 余个业务页面。</p>",
    },
  ],
  projects: [
    {
      id: "pr1",
      name: "统一组件库 V3",
      role: "技术负责人",
      period: { start: "2023-05", end: "2024-01", current: false },
      url: "",
      description:
        "<p>面向公司 6 条产品线的组件库升级。</p><ul><li>按无障碍与暗色主题重做设计规范,交付 48 个组件</li><li>编写 120+ 单测与文档站点,新组件接入平均耗时从 2 天降到 2 小时</li></ul>",
    },
    {
      id: "pr2",
      name: "低代码搭建平台",
      role: "核心开发",
      period: { start: "2022-09", end: "2023-04", current: false },
      url: "",
      description:
        "<p>面向运营团队的页面搭建工具,支持拖拽布局与Schema 驱动渲染。</p><ul><li>设计并实现 Schema 渲染引擎,支持 20+ 组件类型</li><li>支撑运营团队独立产出活动页,研发人力投入下降约 50%</li></ul>",
    },
  ],
  education: [
    {
      id: "ed1",
      school: "华东师范大学",
      degree: "本科",
      major: "计算机科学与技术",
      period: { start: "2016-09", end: "2020-06", current: false },
      description: "<p>GPA 3.7/4.0,专业排名前 10%。ACM 校队成员。</p>",
    },
    {
      id: "ed2",
      school: "上海市实验中学",
      degree: "",
      major: "",
      period: { start: "2013-09", end: "2016-06", current: false },
      description: "",
    },
  ],
  skills: [
    { id: "sk1", name: "React / Next.js", level: "expert" },
    { id: "sk2", name: "TypeScript", level: "expert" },
    { id: "sk3", name: "Node.js", level: "advanced" },
    { id: "sk4", name: "性能优化", level: "advanced" },
    { id: "sk5", name: "前端工程化", level: "advanced" },
    { id: "sk6", name: "数据可视化", level: "intermediate" },
  ],
  languages: [
    { id: "lg1", name: "中文", level: "native" },
    { id: "lg2", name: "英语", level: "C1" },
  ],
  awards: [
    {
      id: "aw1",
      title: "年度技术突破奖",
      awarder: "星云科技",
      date: "2023-12",
      description: "微前端改造项目获评年度最佳技术实践。",
    },
    {
      id: "aw2",
      title: "校级一等奖学金",
      awarder: "华东师范大学",
      date: "2018-09",
      description: "",
    },
  ],
  certificates: [
    { id: "ce1", name: "系统架构设计师(中级)", issuer: "工业和信息化部", date: "2022-06" },
    { id: "ce2", name: "AWS Certified Solutions Architect", issuer: "Amazon Web Services", date: "2023-08" },
  ],
  interests: "长跑、胶片摄影、逛独立书店。",
};

export const SAMPLE_STUDENT: ResumeData = {
  basics: {
    name: "林一诺",
    label: "2027 届本科毕业生 · 前端开发",
    email: "linyinuo@example.com",
    phone: "150-0000-0000",
    gender: "female",
    location: "杭州 · 西湖",
    avatar: "",
    summary: "计算机专业在读,两段前端实习经历,热爱把想法做成能跑的产品。",
  },
  summary:
    "<p>计算机科学与技术专业在读,大二起持续做前端相关项目,有两段互联网公司前端实习经历。熟悉 React 与 Node.js,习惯用 Git 协作,乐于把技术方案写成文档分享给同学。</p>",
  work: [
    {
      id: "ws1",
      company: "潮汐互动",
      position: "前端开发实习生",
      period: { start: "2025-07", end: "", current: true },
      description:
        "<p>负责 App 内嵌 H5 活动页的开发与维护。</p><ul><li>独立完成 9 场营销活动页,平均接入耗时 3 天</li><li>沉淀活动页模板,策划同学可直接复用</li></ul>",
    },
    {
      id: "ws2",
      company: "校园开发者社区",
      position: "技术组负责人",
      period: { start: "2024-09", end: "2025-06", current: false },
      description:
        "<p>带领 12 人技术组运营校内开源社区。</p><ul><li>组织 30+ 场技术分享与工作坊</li><li>社区项目累计获得 1.2k Star</li></ul>",
    },
  ],
  projects: [
    {
      id: "prs1",
      name: "校园二手交易小程序",
      role: "前端负责人",
      period: { start: "2024-03", end: "2024-09", current: false },
      url: "",
      description:
        "<p>面向校内的闲置物品交易小程序,全栈独立完成。</p><ul><li>用 React + Taro 实现跨端,一套代码覆盖微信与支付宝</li><li>上线两个月累计 8000+ 次交易</li></ul>",
    },
    {
      id: "prs2",
      name: "个人博客系统",
      role: "独立开发",
      period: { start: "2023-10", end: "2024-02", current: false },
      url: "",
      description:
        "<p>基于 Next.js 的静态博客,支持 Markdown、暗黑模式与全文搜索。</p>",
    },
  ],
  education: [
    {
      id: "eds1",
      school: "浙江大学",
      degree: "本科在读",
      major: "计算机科学与技术",
      period: { start: "2023-09", end: "2027-06", current: true },
      description: "<p>校级三等奖学金两次,ACM 校队成员。</p>",
    },
    {
      id: "eds2",
      school: "杭州第二中学",
      degree: "",
      major: "",
      period: { start: "2020-09", end: "2023-06", current: false },
      description: "",
    },
  ],
  skills: [
    { id: "sks1", name: "JavaScript / TypeScript", level: "advanced" },
    { id: "sks2", name: "React", level: "advanced" },
    { id: "sks3", name: "HTML / CSS", level: "expert" },
    { id: "sks4", name: "Node.js", level: "intermediate" },
    { id: "sks5", name: "Git", level: "intermediate" },
  ],
  languages: [
    { id: "lgs1", name: "中文", level: "native" },
    { id: "lgs2", name: "英语", level: "B2" },
  ],
  awards: [
    {
      id: "aws1",
      title: "省级程序设计竞赛二等奖",
      awarder: "浙江省大学生程序设计竞赛",
      date: "2024-10",
      description: "",
    },
    {
      id: "aws2",
      title: "优秀学生干部",
      awarder: "浙江大学计算机学院",
      date: "2025-01",
      description: "",
    },
  ],
  certificates: [
    { id: "ces1", name: "软件设计师(初级)", issuer: "工业和信息化部", date: "2024-11" },
  ],
  interests: "手冲咖啡、插画、city walk、逛漫展。",
};

export const SAMPLE_CREATIVE: ResumeData = {
  basics: {
    name: "苏念",
    label: "视觉设计师 / 品牌设计",
    email: "sunian@example.com",
    phone: "186-0000-0000",
    gender: "female",
    location: "深圳 · 南山",
    avatar: "",
    summary: "五年视觉与品牌设计经验,擅长把抽象的品牌语言转成可落地的视觉系统。",
  },
  summary:
    "<p>五年视觉设计经验,服务过消费品牌与互联网产品,擅长品牌视觉系统搭建与线上物料落地。相信好的设计要能扛住量产,也愿意参与从策略到落地的完整链路。</p>",
  work: [
    {
      id: "wc1",
      company: "光合创意",
      position: "资深视觉设计师",
      period: { start: "2022-04", end: "", current: true },
      description:
        "<p>负责品牌客户的整体视觉输出。</p><ul><li>主导 6 个新消费品牌的视觉识别系统,从命名到落地物料全流程把控</li><li>为客户产品拍摄制定视觉规范,上架转化率平均提升 22%</li><li>带领 3 人小组完成双周迭代交付</li></ul>",
    },
    {
      id: "wc2",
      company: "同频网络",
      position: "UI 设计师",
      period: { start: "2020-06", end: "2022-03", current: false },
      description:
        "<p>负责 App 与官网的界面设计。</p><ul><li>重构设计系统,统一 120+ 组件规范,设计稿交付效率提升 35%</li></ul>",
    },
  ],
  projects: [
    {
      id: "prc1",
      name: "山野茶事 品牌重塑",
      role: "主创设计师",
      period: { start: "2024-03", end: "2024-08", current: false },
      url: "",
      description:
        "<p>为新中式茶饮品牌搭建完整视觉识别。</p><ul><li>以山脊与雾霭为视觉母题,输出标志、字体、包装与空间图形系统</li><li>包装上线后首批即被 30+ 渠道采购</li></ul>",
    },
    {
      id: "prc2",
      name: "城市漫展视觉主视觉",
      role: "视觉负责人",
      period: { start: "2023-09", end: "2023-11", current: false },
      url: "",
      description:
        "<p>为城市漫展设计主视觉与延展物料,覆盖 40 余张海报与线上传播图。</p>",
    },
    {
      id: "prc3",
      name: "独立杂志《缓》",
      role: "主编 / 设计",
      period: { start: "2022-01", end: "", current: true },
      url: "",
      description:
        "<p>一本关于城市 slow living 的独立季刊,负责选题、版式与发行。</p>",
    },
  ],
  education: [
    {
      id: "edc1",
      school: "广州美术学院",
      degree: "本科",
      major: "视觉传达设计",
      period: { start: "2015-09", end: "2019-06", current: false },
      description: "<p>毕业设计获院级优秀作品。</p>",
    },
  ],
  skills: [
    { id: "skc1", name: "品牌视觉系统", level: "expert" },
    { id: "skc2", name: "Adobe CC", level: "expert" },
    { id: "skc3", name: "Figma", level: "advanced" },
    { id: "skc4", name: "排版与字体", level: "advanced" },
    { id: "skc5", name: "插画", level: "intermediate" },
    { id: "skc6", name: "动态设计", level: "intermediate" },
  ],
  languages: [
    { id: "lgc1", name: "中文", level: "native" },
    { id: "lgc2", name: "英语", level: "C1" },
    { id: "lgc3", name: "粤语", level: "B2" },
  ],
  awards: [
    {
      id: "awc1",
      title: "金创奖 视觉传达类银奖",
      awarder: "金创奖",
      date: "2024-07",
      description: "",
    },
    {
      id: "awc2",
      title: "年度设计师提名",
      awarder: "光合创意",
      date: "2023-12",
      description: "",
    },
  ],
  certificates: [
    { id: "cec1", name: "平面设计师(高级)", issuer: "视觉传达协会", date: "2022-09" },
  ],
  interests: "看展、拍照、收集旧杂志、做手作。",
};
