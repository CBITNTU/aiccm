/**
 * Seed demo companies for the Chinese (CN) TNDRX deployment.
 *
 * Creates 6 realistic, fully-populated demo companies across 6 sectors so the
 * CN directory doesn't look empty during a demo. Each company is a *system*
 * company (no login user), status=active, verification_status=verified, and has
 * its Capabilities / Markets / Standards junction rows populated by resolving
 * the seeded bilingual reference tables by English name at runtime.
 *
 * Prerequisites: the reference taxonomies must already be seeded
 * (`npm run db:seed-ref`), otherwise the market/standard/capability lookups
 * won't resolve.
 *
 * Usage:
 *   node scripts/seed-demo-companies-cn.mjs          # seed (idempotent)
 *   node scripts/seed-demo-companies-cn.mjs --clean   # remove the demo set
 *
 * Safety: refuses to run against a non-local database unless
 * FORCE_REMOTE_SEED=true (so it can be pointed at the CN prod DB deliberately).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { EXTRA_DEMO_COMPANIES } from "./data/demo-companies-cn-extra.mjs";
import { buildAiAnalysis } from "./data/demo-benchmark.mjs";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Demo companies
// ---------------------------------------------------------------------------
// The first 6 are authored inline (with explicit ids); the remaining 44 come
// from ./data/demo-companies-cn-extra.mjs. IDs are assigned deterministically
// by array position below, so re-runs are idempotent and the set is trivially
// identifiable / removable.
const CURATED_DEMO_COMPANIES = [
  // 1) Construction / 建筑
  {
    id: "d3000001-0000-4000-8000-000000000001",
    companyName: "中建远大建筑工程有限公司 [演示]",
    companiesHouseNumber: "91310000MA1FL2X3D7",
    websiteUrl: "https://zhongjian-yuanda.demo.tndrx.cn",
    address: "上海市浦东新区世纪大道 1200 号建工大厦 18 楼",
    postcode: "200120",
    contactEmail: "contact@zhongjian.demo.tndrx.cn",
    contactPhone: "+86 21 5888 1200",
    contactPerson: "王建国",
    latitude: 31.2304,
    longitude: 121.4737,
    operationLocations: ["上海", "江苏", "浙江", "安徽"],
    description:
      "中建远大建筑工程有限公司成立于 2006 年，是一家专注于房屋建筑、市政基础设施与钢结构工程的大型施工企业，具备建筑工程施工总承包一级资质。公司业务覆盖长三角地区，累计完成各类工程项目 300 余项，涵盖商业综合体、产业园区、市政道路与桥梁、地下管廊等领域。公司以绿色建造与建筑信息模型（BIM）技术应用为核心竞争力，致力于为客户提供从设计咨询、施工建造到运维管理的全生命周期解决方案。",
    keyCapabilities:
      "房屋建筑工程总承包\n市政道路与桥梁施工\n钢结构制作与安装\n地下综合管廊工程\n绿色建筑与装配式建造\nBIM 建模与数字化施工管理\n工程项目管理与咨询",
    certifications:
      "建筑工程施工总承包一级资质\n市政公用工程施工总承包一级资质\nISO 9001 质量管理体系认证\nISO 14001 环境管理体系认证\nISO 45001 职业健康安全管理体系认证\n安全生产许可证",
    equipment:
      "塔式起重机 12 台\n混凝土泵车 8 台\n旋挖钻机 6 台\n大型履带吊 4 台\n全站仪与三维激光扫描仪\nBIM 协同管理平台",
    pastProjects:
      "上海临港产业园区综合体项目（建筑面积 18 万㎡，合同额 6.2 亿元，2021 年竣工）\n苏州工业园区市政道路及管廊工程（道路 12 公里，2020 年竣工）\n杭州钱江新城钢结构办公楼（用钢量 1.4 万吨，2022 年竣工）\n南京江北新区装配式住宅项目（装配率 65%，2023 年在建）",
    aiSummary:
      "中建远大是长三角地区领先的建筑工程总承包企业，在房建、市政与钢结构领域具备一级资质与丰富的项目经验。公司在绿色建造与 BIM 数字化施工方面处于行业先进水平，安全与质量管理体系健全，具备承接大型公共与商业工程的综合实力。",
    aiCompetencies: ["房屋建筑工程总承包", "市政基础设施建设", "钢结构工程", "装配式建筑", "BIM 数字化施工"],
    aiCapabilities: ["大型商业综合体施工", "地下综合管廊工程", "绿色建筑建造", "工程项目全过程管理", "三维激光扫描与测量"],
    aiStrengths: ["一级施工总承包资质", "长三角区域网络", "数字化施工能力", "健全的安全质量体系"],
    aiCertifications: ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 19650"],
    aiRecommendations: ["拓展城市更新与既有建筑改造业务", "深化装配式建筑产业化布局", "加强新能源基础设施施工能力"],
    digitalMaturity: "较高",
    safetyRating: "优秀",
    marketPosition: "区域领先",
    financialData: { 年营业额: "12.8 亿元人民币", 员工人数: 860, 成立年份: 2006, 注册资本: "3 亿元人民币" },
    complianceData: { 资质等级: "施工总承包一级", 安全生产许可证: "有效", 信用评级: "AAA" },
    markets: { l1: "Construction", l2: ["Installation & Commissioning Services"] },
    standards: {
      industry: "Construction & Built Environment",
      codes: ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 19650"],
    },
    capabilities: ["Construction & Built Environment", "Design", "Environmental Services"],
  },

  // 2) Advanced Manufacturing / 制造
  {
    id: "d3000002-0000-4000-8000-000000000002",
    companyName: "华精智能制造股份有限公司 [演示]",
    companiesHouseNumber: "91320500MA1M8K7P2Q",
    websiteUrl: "https://huajing-mfg.demo.tndrx.cn",
    address: "江苏省苏州市工业园区星湖街 328 号智造中心 3 号厂房",
    postcode: "215123",
    contactEmail: "info@huajing.demo.tndrx.cn",
    contactPhone: "+86 512 6288 3300",
    contactPerson: "李文华",
    latitude: 31.2989,
    longitude: 120.7175,
    operationLocations: ["江苏", "上海", "广东"],
    description:
      "华精智能制造股份有限公司是一家专注于精密机械加工、工业机器人集成与增材制造的高新技术企业。公司为汽车、消费电子与航空零部件客户提供高精度零件制造与智能产线解决方案，拥有多条自动化柔性生产线与数字孪生工艺仿真能力。公司坚持以智能制造与质量管理为核心，产品精度可达微米级，广泛应用于新能源汽车与半导体装备领域。",
    keyCapabilities:
      "五轴精密数控加工\n工业机器人系统集成\n金属增材制造（3D 打印）\n自动化柔性产线设计\n精密检测与计量\n数字孪生工艺仿真\n智能工厂 MES 系统实施",
    certifications:
      "ISO 9001 质量管理体系认证\nISO 14001 环境管理体系认证\nISO 45001 职业健康安全管理体系认证\nISO 50001 能源管理体系认证\nIATF 16949 汽车行业质量管理体系\n高新技术企业证书",
    equipment:
      "五轴联动加工中心 20 台\n六轴工业机器人 35 台\n金属激光熔融 3D 打印机 6 台\n三坐标测量仪 8 台\nMES 智能制造执行系统\n数字孪生仿真平台",
    pastProjects:
      "某新能源车企电驱壳体精密加工项目（年产 30 万件，2022 年）\n消费电子精密结构件自动化产线（节拍 8 秒/件，2021 年）\n航空钛合金支架增材制造项目（减重 40%，2023 年）\n半导体设备高精度零部件批量制造（精度 ±2μm，2023 年在产）",
    aiSummary:
      "华精智能制造在精密加工、机器人集成与金属增材制造方面具备行业领先的技术实力，服务新能源汽车、消费电子与半导体高端制造客户。公司数字化与自动化程度高，具备微米级精度制造与柔性产线交付能力，质量体系覆盖汽车与航空标准。",
    aiCompetencies: ["精密数控加工", "工业机器人集成", "金属增材制造", "自动化产线设计", "数字孪生仿真"],
    aiCapabilities: ["微米级精密零件制造", "柔性智能产线交付", "MES 系统实施", "精密检测与计量", "新能源汽车零部件量产"],
    aiStrengths: ["高精度制造能力", "自动化程度高", "IATF 16949 汽车质量体系", "数字化工艺能力"],
    aiCertifications: ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 50001", "IATF 16949"],
    aiRecommendations: ["拓展半导体装备精密制造市场", "深化增材制造在航空航天的应用", "推进黑灯工厂无人化产线"],
    digitalMaturity: "高",
    safetyRating: "良好",
    marketPosition: "细分领先",
    financialData: { 年营业额: "8.6 亿元人民币", 员工人数: 520, 成立年份: 2011, 注册资本: "1.5 亿元人民币" },
    complianceData: { 高新技术企业: "是", 环保验收: "通过", 信用评级: "AA" },
    markets: { l1: "Manufacturing", l2: ["Robotics & Autonomous Systems", "Additive Manufacturing (3D Printing)"] },
    standards: {
      industry: "Manufacturing",
      codes: ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 50001"],
    },
    capabilities: ["Manufacturing & Industrial", "Machining", "Electronics & Semiconductors"],
  },

  // 3) IT & Software / 信息技术
  {
    id: "d3000003-0000-4000-8000-000000000003",
    companyName: "云启数字科技有限公司 [演示]",
    companiesHouseNumber: "91110108MA01C4N9X5",
    websiteUrl: "https://yunqi-tech.demo.tndrx.cn",
    address: "北京市海淀区中关村软件园二期 8 号楼",
    postcode: "100193",
    contactEmail: "hello@yunqi.demo.tndrx.cn",
    contactPhone: "+86 10 8266 9000",
    contactPerson: "张晓宇",
    latitude: 40.0539,
    longitude: 116.2860,
    operationLocations: ["北京", "深圳", "成都"],
    description:
      "云启数字科技有限公司是一家专注于人工智能、云计算与网络安全的软件与解决方案提供商。公司为政府、金融与制造行业客户提供智能数据平台、AI 大模型应用与云原生系统建设服务，拥有自主研发的数据中台与机器学习平台。公司具备完善的信息安全管理体系，服务国内多家大型企业的数字化转型。",
    keyCapabilities:
      "人工智能与机器学习平台研发\n云原生架构与微服务开发\n大数据平台与数据中台建设\n网络安全与等保合规咨询\n企业级软件定制开发\nDevOps 与容器化交付\nAI 大模型应用集成",
    certifications:
      "ISO/IEC 27001 信息安全管理体系认证\nISO 9001 质量管理体系认证\nCMMI 五级认证\n信息系统安全等级保护三级\n软件企业认定证书\n高新技术企业证书",
    equipment:
      "私有云与混合云基础设施\nGPU 训练集群（A100 x 64）\nMLOps 机器学习运维平台\n数据中台与实时计算引擎\nDevOps 持续交付流水线\n安全态势感知平台",
    pastProjects:
      "某省级政务大数据平台建设（服务 2000 万市民，2021 年）\n某股份制银行智能风控系统（实时反欺诈，2022 年）\n某大型制造集团工业互联网平台（连接 5 万+ 设备，2023 年）\n某市网络安全等保合规与态势感知项目（2023 年在建）",
    aiSummary:
      "云启数字科技是国内领先的 AI 与云计算解决方案提供商，在数据中台、机器学习平台与网络安全领域具备自主研发能力。公司服务政务、金融与制造行业的数字化转型，拥有 CMMI 五级与等保三级等高等级资质，信息安全与工程能力成熟。",
    aiCompetencies: ["人工智能与机器学习", "云原生架构", "大数据平台建设", "网络安全合规", "AI 大模型应用"],
    aiCapabilities: ["智能数据中台建设", "云原生系统交付", "实时风控与反欺诈", "等保合规咨询", "MLOps 平台运维"],
    aiStrengths: ["自主研发能力强", "CMMI 五级工程成熟度", "等保三级安全资质", "行业数字化经验丰富"],
    aiCertifications: ["ISO/IEC 27001", "ISO 9001", "CMMI-5", "等保三级"],
    aiRecommendations: ["加大 AI 大模型行业落地投入", "拓展信创与国产化替代业务", "深化金融行业安全合规服务"],
    digitalMaturity: "极高",
    safetyRating: "优秀",
    marketPosition: "行业领先",
    financialData: { 年营业额: "5.4 亿元人民币", 员工人数: 680, 成立年份: 2014, 注册资本: "1 亿元人民币" },
    complianceData: { 等级保护: "三级", CMMI: "五级", 信用评级: "AA" },
    markets: {
      l1: "Information and communication",
      l2: ["Artificial Intelligence & Machine Learning", "Cloud Computing & Data Centres", "Cybersecurity"],
    },
    standards: {
      industry: "Information Technology & Software",
      codes: [],
      extraIndustries: [{ industry: "Cybersecurity Services", codes: [] }],
    },
    capabilities: ["Digital & Data", "Research & Development"],
  },

  // 4) Professional & Engineering services / 专业服务
  {
    id: "d3000004-0000-4000-8000-000000000004",
    companyName: "鼎信工程咨询有限公司 [演示]",
    companiesHouseNumber: "91440300MA5EQ7L3B8",
    websiteUrl: "https://dingxin-consult.demo.tndrx.cn",
    address: "广东省深圳市南山区科技园科苑路 15 号鼎信大厦 22 层",
    postcode: "518057",
    contactEmail: "service@dingxin.demo.tndrx.cn",
    contactPhone: "+86 755 8600 2200",
    contactPerson: "陈立群",
    latitude: 22.5431,
    longitude: 113.9448,
    operationLocations: ["广东", "香港", "海南"],
    description:
      "鼎信工程咨询有限公司是一家综合性工程咨询与检测认证机构，提供工程造价咨询、项目管理、招标代理、检验检测（TIC）与合规评估服务。公司拥有一支由注册造价工程师、监理工程师与检测专家组成的专业团队，服务基础设施、房地产与制造行业客户，以独立、公正、专业著称。",
    keyCapabilities:
      "工程造价咨询与全过程管理\n招标采购代理\n项目管理与监理\n检验、检测与认证（TIC）\n合规与风险评估\n可行性研究与投资咨询\n第三方质量审核",
    certifications:
      "工程造价咨询甲级资质\n工程监理综合资质\nCMA 检验检测机构资质认定\nCNAS 实验室认可\nISO 9001 质量管理体系认证\n招标代理机构资质",
    equipment:
      "工程造价大数据分析平台\n第三方检测实验室\n无损检测设备\n项目全过程管理信息系统\n合规评估工具库",
    pastProjects:
      "深圳前海片区基础设施全过程造价咨询（投资额 40 亿元，2021 年）\n某大型产业园区招标代理与项目管理（2022 年）\n粤港澳大湾区某桥梁工程第三方检测（2022 年）\n某制造企业供应链合规审核项目（2023 年）",
    aiSummary:
      "鼎信工程咨询是华南地区综合实力突出的工程咨询与检测认证机构，具备造价咨询甲级与监理综合资质，以及 CMA/CNAS 检测认可。公司在全过程工程咨询、招标代理与第三方检验检测领域经验丰富，以独立公正的专业服务见长。",
    aiCompetencies: ["工程造价咨询", "项目管理与监理", "招标采购代理", "检验检测认证", "合规与风险评估"],
    aiCapabilities: ["全过程工程咨询", "第三方质量检测", "投资可行性研究", "供应链合规审核", "招标全流程代理"],
    aiStrengths: ["造价咨询甲级资质", "CMA/CNAS 检测认可", "独立第三方公信力", "大湾区区域经验"],
    aiCertifications: ["工程造价甲级", "CMA", "CNAS", "ISO 9001"],
    aiRecommendations: ["拓展全过程工程咨询一体化服务", "布局绿色低碳合规认证", "发展数字化造价与 BIM 咨询"],
    digitalMaturity: "中等",
    safetyRating: "良好",
    marketPosition: "区域知名",
    financialData: { 年营业额: "2.3 亿元人民币", 员工人数: 310, 成立年份: 2009, 注册资本: "8000 万元人民币" },
    complianceData: { 造价咨询资质: "甲级", 检测认可: "CMA/CNAS", 信用评级: "AA" },
    markets: {
      l1: "Professional, scientific and technical activities",
      l2: ["Testing, Inspection & Certification (TIC)"],
    },
    standards: {
      industry: "Professional Services",
      codes: [],
    },
    capabilities: ["Professional Services", "Business Processes", "Design"],
  },

  // 5) Healthcare & Medical devices / 医疗
  {
    id: "d3000005-0000-4000-8000-000000000005",
    companyName: "康泰医疗器械有限公司 [演示]",
    companiesHouseNumber: "91330100MA2GH8R6Y4",
    websiteUrl: "https://kangtai-med.demo.tndrx.cn",
    address: "浙江省杭州市余杭区未来科技城医疗器械产业园 5 号楼",
    postcode: "311121",
    contactEmail: "contact@kangtai.demo.tndrx.cn",
    contactPhone: "+86 571 8890 6600",
    contactPerson: "赵敏",
    latitude: 30.2741,
    longitude: 120.0000,
    operationLocations: ["浙江", "上海", "江苏"],
    description:
      "康泰医疗器械有限公司是一家专注于高端医疗器械研发、生产与销售的创新型企业，产品涵盖体外诊断（IVD）设备、微创手术器械与可穿戴健康监测设备。公司建有符合医疗器械生产质量管理规范（GMP）的洁净生产车间，具备从研发、注册到量产的完整能力，产品已进入国内三甲医院并出口海外。",
    keyCapabilities:
      "体外诊断（IVD）设备研发\n微创手术器械设计与制造\n可穿戴健康监测设备开发\n医疗器械注册与法规事务\nGMP 洁净生产\n生物相容性与临床评价\n医疗软件（SaMD）开发",
    certifications:
      "ISO 13485 医疗器械质量管理体系认证\nISO 9001 质量管理体系认证\n医疗器械生产许可证\nNMPA 医疗器械注册证\nCE 认证\nGMP 生产质量管理规范",
    equipment:
      "十万级洁净生产车间\n体外诊断分析仪产线\n微创器械精密装配线\n生物相容性检测实验室\n医疗器械电气安全检测设备\n临床数据管理系统",
    pastProjects:
      "全自动化学发光免疫分析仪研发与量产（NMPA 注册获批，2021 年）\n微创腹腔镜手术器械系列产品（进入 30 家三甲医院，2022 年）\n可穿戴心电监测设备（获 CE 认证并出口欧洲，2023 年）\n体外诊断试剂配套软件（SaMD）开发（2023 年在研）",
    aiSummary:
      "康泰医疗器械是一家覆盖研发、注册与量产的创新型医疗器械企业，产品线涵盖体外诊断、微创手术器械与可穿戴健康设备。公司具备 ISO 13485 与 GMP 生产体系，产品通过 NMPA 与 CE 认证，进入三甲医院并出口海外，法规与质量能力成熟。",
    aiCompetencies: ["体外诊断设备研发", "微创手术器械制造", "可穿戴健康设备", "医疗器械法规注册", "GMP 洁净生产"],
    aiCapabilities: ["IVD 分析仪量产", "微创器械精密装配", "医疗软件 SaMD 开发", "生物相容性评价", "临床评价与试验"],
    aiStrengths: ["ISO 13485 质量体系", "NMPA/CE 双认证", "研发到量产全链条", "三甲医院与出口渠道"],
    aiCertifications: ["ISO 13485", "ISO 9001", "CE", "NMPA"],
    aiRecommendations: ["加快 AI 辅助诊断产品研发", "拓展海外注册与市场准入", "布局家用便携医疗设备"],
    digitalMaturity: "较高",
    safetyRating: "优秀",
    marketPosition: "细分创新者",
    financialData: { 年营业额: "3.7 亿元人民币", 员工人数: 420, 成立年份: 2013, 注册资本: "1.2 亿元人民币" },
    complianceData: { 生产许可: "有效", 质量体系: "ISO 13485", 信用评级: "AA" },
    markets: {
      l1: "Human health and social work activities",
      l2: ["Biotechnology & Synthetic Biology"],
    },
    standards: {
      industry: "Medical Devices",
      codes: [],
      extraIndustries: [{ industry: "Healthcare Services", codes: [] }],
    },
    capabilities: ["Healthcare & Life Sciences", "Research & Development"],
  },

  // 6) Energy & Environmental / 能源环境
  {
    id: "d3000006-0000-4000-8000-000000000006",
    companyName: "绿源新能源环境工程有限公司 [演示]",
    companiesHouseNumber: "91510100MA6DK2W7F1",
    websiteUrl: "https://lvyuan-energy.demo.tndrx.cn",
    address: "四川省成都市高新区天府大道中段 666 号绿能大厦 10 层",
    postcode: "610041",
    contactEmail: "info@lvyuan.demo.tndrx.cn",
    contactPhone: "+86 28 8500 7700",
    contactPerson: "刘志强",
    latitude: 30.5728,
    longitude: 104.0668,
    operationLocations: ["四川", "重庆", "云南", "陕西"],
    description:
      "绿源新能源环境工程有限公司专注于清洁能源与环境治理工程，业务涵盖光伏与风电场建设、氢能系统集成、储能电站以及污水与固废处理工程。公司提供从规划设计、EPC 总承包到运维托管的一体化服务，致力于推动区域能源结构转型与碳中和目标实现。",
    keyCapabilities:
      "光伏与风电场 EPC 总承包\n氢能制储运用系统集成\n储能电站设计与建设\n污水处理与再生水工程\n固废与危废处理\n合同能源管理（EMC）\n碳排放核算与碳资产管理",
    certifications:
      "ISO 50001 能源管理体系认证\nISO 14001 环境管理体系认证\nISO 9001 质量管理体系认证\n环保工程专业承包资质\n电力工程施工总承包资质\n安全生产许可证",
    equipment:
      "光伏组件安装与运维设备\n氢能电解槽测试平台\n储能系统集成实验室\n污水处理中试装置\n在线环境监测系统\n能源管理与碳核算平台",
    pastProjects:
      "四川某 200MW 山地光伏电站 EPC 项目（年发电 2.8 亿度，2021 年）\n某工业园区绿氢制储加一体化示范项目（2022 年）\n重庆某污水处理厂提标改造工程（处理量 10 万吨/日，2022 年）\n某市固废资源化利用与合同能源管理项目（2023 年在建）",
    aiSummary:
      "绿源新能源环境工程是西南地区清洁能源与环境治理领域的综合工程服务商，覆盖光伏、风电、氢能、储能与水固废处理。公司具备 EPC 总承包与运维一体化能力，以及能源与环境管理双体系认证，在碳中和与能源转型市场具有较强竞争力。",
    aiCompetencies: ["光伏与风电工程", "氢能系统集成", "储能电站建设", "水与固废处理", "合同能源管理"],
    aiCapabilities: ["新能源电站 EPC 交付", "绿氢制储加一体化", "污水提标改造", "碳排放核算与管理", "能源运维托管"],
    aiStrengths: ["清洁能源全产业链能力", "能源与环境双体系认证", "EPC 一体化交付", "西南区域项目经验"],
    aiCertifications: ["ISO 50001", "ISO 14001", "ISO 9001"],
    aiRecommendations: ["扩大氢能与储能一体化项目布局", "发展碳资产管理与碳交易服务", "拓展工商业分布式光伏市场"],
    digitalMaturity: "中等",
    safetyRating: "良好",
    marketPosition: "区域领先",
    financialData: { 年营业额: "6.1 亿元人民币", 员工人数: 480, 成立年份: 2012, 注册资本: "2 亿元人民币" },
    complianceData: { 环保承包资质: "专业承包", 安全生产许可证: "有效", 信用评级: "AA" },
    markets: {
      l1: "Electricity, gas, steam and air conditioning supply",
      l2: ["ClimateTech / CleanTech (enabling tech)", "Hydrogen & Hydrogen Systems (enabling tech)"],
    },
    standards: {
      industry: "Energy & Utilities",
      codes: ["ISO 50001", "ISO 14001"],
      extraIndustries: [{ industry: "Environmental Services", codes: [] }],
    },
    capabilities: ["Energy & Utilities", "Renewable Energy", "Environmental Services"],
  },
];

// Deterministic UUID from a 1-based position, e.g. 1 -> d3000001-...-000000000001.
// The inline curated companies already use this scheme for ids 1-6.
function demoId(position) {
  const hex = position.toString(16).padStart(2, "0");
  return `d30000${hex}-0000-4000-8000-0000000000${hex}`;
}

// Full set = 6 curated + 44 extra. Assign ids by position (fill any missing).
const DEMO_COMPANIES = [...CURATED_DEMO_COMPANIES, ...EXTRA_DEMO_COMPANIES].map(
  (c, i) => ({ ...c, id: c.id || demoId(i + 1) }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isLikelyLocalDatabase(urlString) {
  try {
    const { hostname } = new URL(urlString);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function assertReferenceDataSeeded(client) {
  const checks = [
    ["markets", "markets"],
    ["standards_ref", "standards_ref"],
    ["company_capabilities_ref", "company_capabilities_ref"],
  ];
  for (const [label, table] of checks) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
    if (rows[0].n === 0) {
      throw new Error(
        `Reference table "${label}" is empty. Seed the taxonomies first: npm run db:seed-ref`,
      );
    }
  }
}

// Build lookup maps for the reference tables.
async function loadReferences(client) {
  const marketRows = (await client.query(`SELECT id, name FROM public.markets`)).rows;
  const marketByName = new Map(marketRows.map((r) => [r.name, r.id]));

  const capRows = (
    await client.query(`SELECT id, name FROM public.company_capabilities_ref`)
  ).rows;
  const capByName = new Map(capRows.map((r) => [r.name, r.id]));

  // Standards: names (e.g. "ISO 9001") repeat under different industry parents,
  // so index by parent. Keep L1 name -> id, and (parentId, name) -> id.
  const stdRows = (
    await client.query(`SELECT id, name, parent_id FROM public.standards_ref`)
  ).rows;
  const stdIndustryByName = new Map(
    stdRows.filter((r) => r.parent_id === null).map((r) => [r.name, r.id]),
  );
  const stdByParentAndName = new Map(
    stdRows
      .filter((r) => r.parent_id !== null)
      .map((r) => [`${r.parent_id}::${r.name}`, r.id]),
  );

  return { marketByName, capByName, stdIndustryByName, stdByParentAndName };
}

// Resolve a company's markets/standards/capabilities to reference IDs.
// Returns { marketIds, standardIds, capabilityIds } and pushes any unmatched
// names into `warnings`.
function resolveLinks(company, refs, warnings) {
  const { marketByName, capByName, stdIndustryByName, stdByParentAndName } = refs;

  // Markets: L1 + listed L2 (all by unique name)
  const marketNames = [company.markets.l1, ...(company.markets.l2 || [])];
  const marketIds = [];
  for (const name of marketNames) {
    const id = marketByName.get(name);
    if (id) marketIds.push(id);
    else warnings.push(`[${company.companyName}] market not found: "${name}"`);
  }

  // Capabilities (L1 domain names, unique)
  const capabilityIds = [];
  for (const name of company.capabilities) {
    const id = capByName.get(name);
    if (id) capabilityIds.push(id);
    else warnings.push(`[${company.companyName}] capability not found: "${name}"`);
  }

  // Standards: link the industry L1 rows and any listed L2 codes under them.
  const industryGroups = [
    { industry: company.standards.industry, codes: company.standards.codes || [] },
    ...(company.standards.extraIndustries || []),
  ];
  const standardIds = [];
  for (const group of industryGroups) {
    const industryId = stdIndustryByName.get(group.industry);
    if (!industryId) {
      warnings.push(`[${company.companyName}] standards industry not found: "${group.industry}"`);
      continue;
    }
    standardIds.push(industryId); // link the industry L1 itself
    for (const code of group.codes) {
      const id = stdByParentAndName.get(`${industryId}::${code}`);
      if (id) standardIds.push(id);
      else
        warnings.push(
          `[${company.companyName}] standard "${code}" not found under "${group.industry}"`,
        );
    }
  }

  return {
    marketIds: [...new Set(marketIds)],
    standardIds: [...new Set(standardIds)],
    capabilityIds: [...new Set(capabilityIds)],
  };
}

// ---------------------------------------------------------------------------
// Seed / clean
// ---------------------------------------------------------------------------
async function cleanDemo(client) {
  const ids = DEMO_COMPANIES.map((c) => c.id);
  const { rowCount } = await client.query(
    `DELETE FROM public.companies WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  console.log(`🧹 Removed ${rowCount} demo company row(s) (junctions cascade).`);
}

async function seedDemo(client) {
  await assertReferenceDataSeeded(client);
  const refs = await loadReferences(client);
  const warnings = [];

  for (const c of DEMO_COMPANIES) {
    const links = resolveLinks(c, refs, warnings);

    await client.query(
      `INSERT INTO "companies" (
         id, user_id, company_name, companies_house_number, website_url, postcode, address,
         contact_email, contact_phone, contact_person, description, key_capabilities,
         certifications, equipment, past_projects,
         ai_competencies, ai_capabilities, ai_strengths, ai_certifications, ai_recommendations,
         ai_analysis, ai_summary, digital_maturity, safety_rating, market_position,
         status, is_system_company, system_extracted, human_verified,
         financial_data, compliance_data, operation_locations, latitude, longitude,
         verification_status, verified_at, created_at, updated_at
       ) VALUES (
         $1, NULL, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24,
         'active', true, '{}'::jsonb, '{}'::jsonb,
         $25, $26, $27, $28, $29,
         'unverified', NULL, NOW(), NOW()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        c.id,
        c.companyName,
        c.companiesHouseNumber,
        c.websiteUrl,
        c.postcode,
        c.address,
        c.contactEmail,
        c.contactPhone,
        c.contactPerson,
        c.description,
        c.keyCapabilities,
        c.certifications,
        c.equipment,
        c.pastProjects,
        JSON.stringify(c.aiCompetencies),
        JSON.stringify(c.aiCapabilities),
        JSON.stringify(c.aiStrengths),
        JSON.stringify(c.aiCertifications),
        JSON.stringify(c.aiRecommendations),
        JSON.stringify(buildAiAnalysis(c)),
        c.aiSummary,
        c.digitalMaturity,
        c.safetyRating,
        c.marketPosition,
        JSON.stringify(c.financialData),
        JSON.stringify(c.complianceData),
        JSON.stringify(c.operationLocations),
        c.latitude,
        c.longitude,
      ],
    );

    for (const marketId of links.marketIds) {
      await client.query(
        `INSERT INTO "company_markets" (company_id, market_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [c.id, marketId],
      );
    }
    for (const standardId of links.standardIds) {
      await client.query(
        `INSERT INTO "company_standards" (company_id, standard_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [c.id, standardId],
      );
    }
    for (const capabilityId of links.capabilityIds) {
      await client.query(
        `INSERT INTO "company_capabilities" (id, company_id, capability_id, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [randomUUID(), c.id, capabilityId],
      );
    }

    // Refresh ai_analysis on every run so already-seeded rows pick up benchmark
    // changes (the INSERT above is a no-op for existing ids via ON CONFLICT).
    await client.query(`UPDATE "companies" SET ai_analysis = $2 WHERE id = $1`, [
      c.id,
      JSON.stringify(buildAiAnalysis(c)),
    ]);

    console.log(
      `  ✓ ${c.companyName} — ${links.marketIds.length} markets, ` +
        `${links.standardIds.length} standards, ${links.capabilityIds.length} capabilities`,
    );
  }

  if (warnings.length) {
    console.log("\n⚠️  Unresolved reference names (skipped):");
    for (const w of warnings) console.log(`   - ${w}`);
  }
  console.log(`\n✅ Seeded ${DEMO_COMPANIES.length} demo companies.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL is not set (check .env.local).");
    process.exit(1);
  }

  const clean = process.argv.includes("--clean");
  let host = "(unparseable)";
  try {
    host = new URL(databaseUrl).host;
  } catch {}

  const local = isLikelyLocalDatabase(databaseUrl);
  if (!local && process.env.FORCE_REMOTE_SEED !== "true") {
    console.error(
      `❌ Refusing to run against a non-local database (${host}).\n` +
        `   Set FORCE_REMOTE_SEED=true if you intend to seed the CN production DB.`,
    );
    process.exit(1);
  }

  console.log(`🎯 Target database: ${host}${local ? " (local)" : " (REMOTE)"}`);
  console.log(clean ? "Mode: CLEAN (removing demo companies)\n" : "Mode: SEED\n");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (clean) {
      await cleanDemo(client);
    } else {
      await seedDemo(client);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
