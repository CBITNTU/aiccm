/**
 * Display translations for EIC taxonomy category names.
 *
 * The taxonomy itself (see `lib/eicTaxonomy.ts` and the `taxonomies` DB table) stores
 * canonical ENGLISH names. Those English strings are also used by AI matching, so we do
 * NOT translate them at rest — instead this module provides a locale-keyed lookup used
 * purely for DISPLAY when the active locale has a translation.
 *
 * Adding another language is a single-block change: add a new `Record<string, string>`
 * of English-name -> translated-name and register it under its locale in
 * `TAXONOMY_TRANSLATIONS`. Any name without a translation falls back to the English name,
 * so partial coverage is safe.
 */

const zhCN: Record<string, string> = {
  // Top-level categories
  Agriculture: "农业",
  Biotechnology: "生物技术",
  "Construction, Civil engineering, Infrastructures": "建筑、土木工程与基础设施",
  "Consumer products and services": "消费品与服务",
  "Earth and related environmental sciences": "地球与环境科学",
  "Education and Culture": "教育与文化",
  Energy: "能源",
  "Engineering and Technology": "工程与技术",
  "Food and Beverages": "食品与饮料",
  Health: "健康",
  "Information and Communication Technology (ICT)": "信息与通信技术 (ICT)",
  "Public Sector Innovation": "公共部门创新",
  Security: "安全",
  Space: "航天",
  "Transport and Mobility": "交通与出行",

  // Agriculture
  Agronomy: "农学",
  "Animal and Dairy science": "动物与乳品科学",
  Aquaculture: "水产养殖",
  "Aquatic biology, Hydrobiology": "水生生物学、湖沼生物学",
  Fishery: "渔业",
  Forestry: "林业",
  "Horticulture, viticulture": "园艺、葡萄栽培",
  Husbandry: "畜牧业",
  "Paper and wood": "纸张与木材",
  "Plant breeding and plant protection": "植物育种与植物保护",
  "Precision agriculture": "精准农业",
  "Soil management": "土壤管理",

  // Biotechnology
  Biochemistry: "生物化学",
  Bacteriology: "细菌学",
  Bioeconomy: "生物经济",
  "Biohazards, biological containment, biosafety, biosecurity":
    "生物危害、生物防护、生物安全与生物安保",
  Bioinformatics: "生物信息学",
  "Bioproducts (biomaterials, bioplastics, biofuels)":
    "生物制品（生物材料、生物塑料、生物燃料）",
  "Bioremediation, biodegradation": "生物修复与生物降解",
  "Biotechnology (non-medical), bioreactors, applied microbiology":
    "生物技术（非医用）、生物反应器与应用微生物学",
  "DNA synthesis, modification, repair, recombination":
    "DNA 合成、修饰、修复与重组",
  "Genetics and heredity": "遗传学与遗传",
  "Human biology": "人类生物学",
  Microbiology: "微生物学",
  "Neurochemistry and neuropharmacology": "神经化学与神经药理学",
  "Plant sciences, botany": "植物科学与植物学",
  "Reproductive biology": "生殖生物学",
  Serology: "血清学",
  "Tissue culture": "组织培养",
  Zoology: "动物学",
  "Bioprocessing technologies (biocatalysis, fermentation)":
    "生物加工技术（生物催化、发酵）",

  // Construction, Civil engineering, Infrastructures
  "Glass, ceramics & construction material": "玻璃、陶瓷与建筑材料",
  "Architecture, smart buildings, smart cities": "建筑、智能楼宇与智慧城市",
  "Civil engineering, maritime/hydraulic engineering":
    "土木工程、海事/水利工程",
  "Construction engineering, Municipal and structural engineering":
    "建筑工程、市政与结构工程",
  "Low/nearly zero & energy positive buildings":
    "低能耗/近零能耗与产能建筑",
  "Urban studies (Planning and development)": "城市研究（规划与开发）",

  // Consumer products and services
  "Distribution and logistics": "分销与物流",
  "Electronic commerce (eCommerce)": "电子商务",
  "Household products": "家居用品",
  "Leisure products": "休闲产品",
  "Leisure services": "休闲服务",
  "Personal products and services": "个人用品与服务",
  "Retail, wholesale or distribution": "零售、批发与分销",
  "Service innovation": "服务创新",
  "Supply chain management": "供应链管理",
  "Textiles, apparel and luxury goods": "纺织、服装与奢侈品",
  "Tourism / Travel": "旅游/旅行",

  // Earth and related environmental sciences
  "Environmental protection": "环境保护",
  "Atmospheric chemistry, air pollution": "大气化学与空气污染",
  "Circular economy": "循环经济",
  "Climatology and climate change": "气候学与气候变化",
  "Decontamination and de-pollution": "净化与污染治理",
  Ecology: "生态学",
  "Environmental and Green Technologies": "环境与绿色技术",
  "Flood forecasting": "洪水预报",
  "Geographical information systems, cartography": "地理信息系统与制图",
  "Geo-information and spatial data analysis": "地理信息与空间数据分析",
  "Geology, tectonics, volcanology": "地质学、构造学与火山学",
  Hydrology: "水文学",
  "Marine biology": "海洋生物学",
  "Marine ecosystems and processes": "海洋生态系统与过程",
  Meteorology: "气象学",
  Mineralogy: "矿物学",
  "Natural resources exploration and exploitation": "自然资源勘探与开发",
  "Waste management": "废物管理",
  "Waste recycling": "废物回收",
  "Wastewater treatment": "废水处理",
  Water: "水资源",

  // Education and Culture
  Education: "教育",
  Psychology: "心理学",
  "Social Media": "社交媒体",
  "Arts (performing arts, music)": "艺术（表演艺术、音乐）",
  "Behavioural change": "行为改变",
  "Cultural heritage, cultural memory": "文化遗产与文化记忆",
  "Design innovation": "设计创新",
  "Informal education": "非正式教育",
  "Innovation and diversity": "创新与多样性",
  "Languages and Literature": "语言与文学",
  "Life long learning": "终身学习",
  "Media and communications": "媒体与传播",
  "Social issues": "社会问题",
  "Teaching materials": "教学材料",

  // Energy
  Biodiesel: "生物柴油",
  Bioenergy: "生物能源",
  Biofuels: "生物燃料",
  Biogas: "沼气",
  Biomass: "生物质",
  Biomethane: "生物甲烷",
  "Domestic appliances": "家用电器",
  "Electricity Transmission/Distribution": "输配电",
  "Electrochemistry, batteries and fuel cells": "电化学、电池与燃料电池",
  "Energy Economics": "能源经济学",
  "Energy Efficiency": "能效",
  "Energy management": "能源管理",
  "Energy systems (production, distribution, application)":
    "能源系统（生产、配送、应用）",
  "Smart energy, smart grids, wireless energy transfer":
    "智慧能源、智能电网与无线能量传输",
  "Fuel Production & Distribution": "燃料生产与配送",
  Hydrogen: "氢能",
  "Low/zero carbon communities": "低碳/零碳社区",
  "Natural gas": "天然气",
  Photovoltaics: "光伏",
  "Renewable energy sources": "可再生能源",
  "Solar cooling": "太阳能制冷",
  "Solar thermal": "太阳能热利用",

  // Engineering and Technology
  "Manufacturing and processing": "制造与加工",
  Acoustics: "声学",
  "Audio engineering, reliability analysis": "音频工程与可靠性分析",
  "Automation and control systems": "自动化与控制系统",
  "Chemical engineering, technical chemistry": "化学工程与技术化学",
  "Communication engineering and systems": "通信工程与系统",
  "Control engineering": "控制工程",
  "Electrical and electronic engineering": "电气与电子工程",
  Electromagnetism: "电磁学",
  "Electromechanical engineering": "机电工程",
  "Electronics, photonics": "电子学与光子学",
  "Graphene, layered material": "石墨烯与层状材料",
  "Industrial bioengineering": "工业生物工程",
  "Materials engineering": "材料工程",
  "Mechanical engineering": "机械工程",
  Metallurgy: "冶金学",
  "Metrology and measurement": "计量与测量",
  "Micro (system) engineering": "微（系统）工程",
  "Nanotechnology, nano-materials": "纳米技术与纳米材料",
  "Novel Materials": "新型材料",
  "Ocean engineering": "海洋工程",
  "Optics (laser optics and quantum optics)": "光学（激光光学与量子光学）",
  "Organic electronics": "有机电子学",
  Photonics: "光子学",
  "Porous Materials": "多孔材料",
  "Production technology, process engineering": "生产技术与工艺工程",
  "Propulsion systems engineering": "推进系统工程",
  Robotics: "机器人技术",
  Semiconductors: "半导体",
  "Solid state materials": "固态材料",
  Superconductivity: "超导",
  Thermodynamics: "热力学",

  // Food and Beverages
  "Agricultural products": "农产品",
  Brewers: "啤酒酿造",
  "Distillers and vintners": "蒸馏酒与葡萄酒酿造",
  "Food additives": "食品添加剂",
  "Food contamination": "食品污染",
  "Food packaging": "食品包装",
  "Food preservation": "食品保鲜",
  "Food quality": "食品质量",
  "Food safety": "食品安全",
  "Food storage": "食品储存",
  "Food technology": "食品技术",
  "Secure food chain and wealth products": "安全食品链与相关产品",
  "Soft drinks": "软饮料",

  // Health
  Ageing: "衰老",
  Biomarkers: "生物标志物",
  "Cardiac and Cardiovascular systems": "心脏与心血管系统",
  "Clinical medicine": "临床医学",
  "Critical care medicine and Emergency medicine": "重症医学与急诊医学",
  "Dentistry, oral surgery and medicine": "牙科、口腔外科与口腔医学",
  "Dermatology and venereal diseases": "皮肤病与性病学",
  "Diagnostic tools (genetic, imaging)": "诊断工具（基因、影像）",
  Drugs: "药物",
  eHealth: "电子健康",
  "Endocrinology and metabolism": "内分泌与代谢",
  "Gene therapy": "基因治疗",
  "Geriatrics and gerontology": "老年医学与老年学",
  "Healthcare system": "医疗系统",
  "Health-related biotechnology": "健康相关生物技术",
  "Human genetics": "人类遗传学",
  Immunology: "免疫学",
  "Infectious diseases": "传染病",
  "Medical devices": "医疗器械",
  "Neurodegenerative disorders": "神经退行性疾病",
  "Obstetrics and gynaecology": "妇产科",
  Oncology: "肿瘤学",
  Ophthalmology: "眼科学",
  Orthopaedics: "骨科",
  Paediatrics: "儿科",
  Pathology: "病理学",
  "Patient care": "患者护理",
  "Personalised treatment": "个性化治疗",
  "Pharmacology and pharmacy": "药理学与药学",
  Psychiatry: "精神病学",
  "Radiology, nuclear medicine and medical imaging":
    "放射学、核医学与医学影像",
  Rehabilitation: "康复",
  "Respiratory systems": "呼吸系统",
  Rheumatology: "风湿病学",
  "Robotics for healthcare": "医疗机器人",
  Surgery: "外科",
  Toxicology: "毒理学",
  Transplantation: "器官移植",
  "Urology and nephrology": "泌尿科与肾脏科",
  Vaccines: "疫苗",
  Virology: "病毒学",
  Wellbeing: "健康福祉",

  // Information and Communication Technology (ICT)
  "Artificial intelligence": "人工智能",
  "Blockchain and Distributed Ledger Technology (DLT)":
    "区块链与分布式账本技术 (DLT)",
  "Internet of Things, embedded systems": "物联网与嵌入式系统",
  "Big data": "大数据",
  "Extended Reality (XR)": "扩展现实 (XR)",
  "Advanced computing": "先进计算",
  "Algorithms and complexity": "算法与复杂性",
  "Unmanned aircraft (Drone)": "无人机",
  "Cloud computing": "云计算",
  "Communication networks, media": "通信网络与媒体",
  "Communication technology, high-frequency technology":
    "通信技术与高频技术",
  "Computational engineering": "计算工程",
  "Computer graphics": "计算机图形学",
  "Computer hardware and architecture": "计算机硬件与体系结构",
  "Computer sciences, information science": "计算机科学与信息科学",
  "Cryptology, security, privacy, quantum crypto":
    "密码学、安全、隐私与量子密码",
  "Cyber-physical systems": "信息物理系统",
  Cybersecurity: "网络安全",
  "Data protection and privacy": "数据保护与隐私",
  "Digital games, gamification, serious games":
    "数字游戏、游戏化与严肃游戏",
  "Digital services": "数字服务",
  "E-learning, user modelling, collaborative systems":
    "电子学习、用户建模与协作系统",
  "5G network technology": "5G 网络技术",
  "Fintech (Financial technology)": "金融科技",
  "Human computer interaction and interface": "人机交互与界面",
  "Assistive Technologies": "辅助技术",
  "Internet Services & Applications": "互联网服务与应用",
  "Machine learning, statistical data processing": "机器学习与统计数据处理",
  "Networks (communication, sensor, robots)": "网络（通信、传感器、机器人）",
  "Neuroimaging and computational neuroscience": "神经影像与计算神经科学",
  "Ontologies, neural networks, genetic programming":
    "本体、神经网络与遗传编程",
  "Scientific computing, simulation and modelling": "科学计算、仿真与建模",
  "Software engineering, operating systems": "软件工程与操作系统",

  // Public Sector Innovation
  "Business model innovation": "商业模式创新",
  "Corporate Social responsibility": "企业社会责任",
  "Human resource management": "人力资源管理",
  "Open data": "开放数据",
  "Open innovation": "开放式创新",
  "Public administration innovation": "公共管理创新",
  "Social innovation": "社会创新",

  // Security
  "Chemical, Biological, Radiological and Nuclear (CBRN) protection":
    "化学、生物、放射与核（CBRN）防护",
  "Crisis management": "危机管理",
  "Critical infrastructure, emergency systems": "关键基础设施与应急系统",
  "Detection technology": "检测技术",
  "Explosives removal": "爆炸物清除",
  "Forensic technologies": "法医技术",
  Identification: "身份识别",
  "Information Security Technologies": "信息安全技术",
  "Interoperable secured communications": "互操作安全通信",
  "Navigation, guidance, control and tracking": "导航、制导、控制与跟踪",
  "Networks and information security systems": "网络与信息安全系统",
  Protection: "防护",
  "Risk management": "风险管理",
  "Search and detection": "搜索与探测",
  Surveillance: "监控",

  // Space
  "Earth Observation / Services and applications": "对地观测/服务与应用",
  "Flight Dynamics / Position, Navigation, and Timing":
    "飞行动力学/定位、导航与授时",
  "Global Satellite Navigation System (GNSS)": "全球卫星导航系统 (GNSS)",
  "Instrumentation - telescopes, detectors": "仪器 - 望远镜与探测器",
  Launchers: "运载火箭",
  "On-Board Data Systems": "星载数据系统",
  "Orbital transportation and re-entry systems": "轨道运输与再入系统",
  "Remote sensing": "遥感",
  "RF Payload and Systems": "射频载荷与系统",
  "Satellites and Probes": "卫星与探测器",
  "Space data exploitation": "空间数据利用",
  "Space Debris": "空间碎片",
  "Space services and products": "空间服务与产品",
  Spacecraft: "航天器",
  "Supporting Propulsion Technologies": "辅助推进技术",
  Telecommunications: "电信",

  // Transport and Mobility
  "Aircraft Avionics, Systems & Equipment": "航空电子、系统与设备",
  Airports: "机场",
  Automation: "自动化",
  Automotive: "汽车",
  Logistics: "物流",
  "Maritime and infrastructure": "海事与基础设施",
  "Maritime transport": "海运",
  Multimodality: "多式联运",
  "Network infrastructures": "网络基础设施",
  Propulsion: "推进",
  "Rail infrastructure": "铁路基础设施",
  "Rail Transport": "铁路运输",
  "Road infrastructure": "道路基础设施",
  "Road transport": "道路运输",
  "Sea vessels": "船舶",
  "Sustainable transport": "可持续交通",
  "Air traffic management (ATM)": "空中交通管理 (ATM)",
  "Transport engineering": "交通工程",
  "Urban transport": "城市交通",
  "Vehicle Technology": "车辆技术",
};

/** English taxonomy name -> translated name, keyed by locale. */
export const TAXONOMY_TRANSLATIONS: Record<string, Record<string, string>> = {
  "zh-CN": zhCN,
};

/**
 * Return the display name for a taxonomy category in the given locale, falling back to
 * the canonical English name when no translation exists (or the locale is unsupported).
 */
export function translateTaxonomyName(name: string, locale: string): string {
  if (!name) return name;
  return TAXONOMY_TRANSLATIONS[locale]?.[name] ?? name;
}
