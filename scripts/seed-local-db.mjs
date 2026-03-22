import { config } from "dotenv";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

config({ path: ".env.local" });

// ============================================================================
// Safety
// ============================================================================

function isLikelyLocalDatabase(urlString) {
  try {
    const { hostname } = new URL(urlString);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

// ============================================================================
// Deterministic UUIDs for easy reference during testing
// ============================================================================

const IDS = {
  // Users (v4-compliant: version nibble=4, variant nibble=8)
  superadmin: "00000000-0000-4000-8000-000000000001",
  marios: "00000000-0000-4000-8000-000000000002",
  leytis: "00000000-0000-4000-8000-000000000003",

  // Companies (owned)
  leytisCompany1: "00000000-0000-4000-8001-000000000001",
  leytisCompany2: "00000000-0000-4000-8001-000000000002",
  mariosCompany1: "00000000-0000-4000-8001-000000000003",

  // Companies (system/unowned)
  sysElectrical: "00000000-0000-4000-8001-000000000004",
  sysPlumbing: "00000000-0000-4000-8001-000000000005",
  sysScaffolding: "00000000-0000-4000-8001-000000000006",
  sysDemolition: "00000000-0000-4000-8001-000000000007",
  sysEnvironmental: "00000000-0000-4000-8001-000000000008",
  sysIT: "00000000-0000-4000-8001-000000000009",
  sysSurveying: "00000000-0000-4000-8001-000000000010",

  // Taxonomies (CPV code categories)
  taxConstruction: "00000000-0000-4000-8002-000000000001",
  taxSitePrep: "00000000-0000-4000-8002-000000000002",
  taxBuildingWorks: "00000000-0000-4000-8002-000000000003",
  taxInstallation: "00000000-0000-4000-8002-000000000004",
  taxCompletion: "00000000-0000-4000-8002-000000000005",
  taxArchEng: "00000000-0000-4000-8002-000000000006",
  taxEngineering: "00000000-0000-4000-8002-000000000007",
  taxIT: "00000000-0000-4000-8002-000000000008",
  taxEnvironmental: "00000000-0000-4000-8002-000000000009",
  taxElectrical: "00000000-0000-4000-8002-000000000010",
  taxRepairMaint: "00000000-0000-4000-8002-000000000011",
  taxBusiness: "00000000-0000-4000-8002-000000000012",
  taxSoftware: "00000000-0000-4000-8002-000000000013",
  taxSurveying: "00000000-0000-4000-8002-000000000014",
  taxCivilEng: "00000000-0000-4000-8002-000000000015",
};

// ============================================================================
// Seed Data
// ============================================================================

const USERS = [
  {
    id: IDS.superadmin,
    name: "Admin User",
    email: "admin@tndrx.dev",
    firstName: "Admin",
    lastName: "User",
    role: "superadmin",
    appRole: "superadmin",
  },
  {
    id: IDS.marios,
    name: "Marios Georgiou",
    email: "marios@tndrx.dev",
    firstName: "Marios",
    lastName: "Georgiou",
    role: "user",
    appRole: "sme-owner",
  },
  {
    id: IDS.leytis,
    name: "Leytis Chen",
    email: "leytis@tndrx.dev",
    firstName: "Leytis",
    lastName: "Chen",
    role: "user",
    appRole: "sme-owner",
  },
];

const TAXONOMIES = [
  { id: IDS.taxConstruction, name: "Construction work", cpv: "45000000", level: 1 },
  { id: IDS.taxSitePrep, name: "Site preparation work", cpv: "45100000", level: 2, parentId: IDS.taxConstruction },
  { id: IDS.taxBuildingWorks, name: "Building construction and civil engineering", cpv: "45200000", level: 2, parentId: IDS.taxConstruction },
  { id: IDS.taxInstallation, name: "Building installation work", cpv: "45300000", level: 2, parentId: IDS.taxConstruction },
  { id: IDS.taxCompletion, name: "Building completion work", cpv: "45400000", level: 2, parentId: IDS.taxConstruction },
  { id: IDS.taxArchEng, name: "Architectural, construction, engineering services", cpv: "71000000", level: 1 },
  { id: IDS.taxEngineering, name: "Engineering services", cpv: "71300000", level: 2, parentId: IDS.taxArchEng },
  { id: IDS.taxCivilEng, name: "Civil engineering design", cpv: "71320000", level: 3, parentId: IDS.taxEngineering },
  { id: IDS.taxSurveying, name: "Surveying services", cpv: "71350000", level: 2, parentId: IDS.taxArchEng },
  { id: IDS.taxIT, name: "IT services", cpv: "72000000", level: 1 },
  { id: IDS.taxSoftware, name: "Software programming and consultancy", cpv: "72200000", level: 2, parentId: IDS.taxIT },
  { id: IDS.taxEnvironmental, name: "Sewage, refuse, cleaning and environmental services", cpv: "90000000", level: 1 },
  { id: IDS.taxElectrical, name: "Electrical machinery and equipment", cpv: "31000000", level: 1 },
  { id: IDS.taxRepairMaint, name: "Repair and maintenance services", cpv: "50000000", level: 1 },
  { id: IDS.taxBusiness, name: "Business services", cpv: "79000000", level: 1 },
];

const COMPANIES = [
  // Leytis's companies
  {
    id: IDS.leytisCompany1,
    userId: IDS.leytis,
    companyName: "Chen Construction Group Ltd",
    description: "Full-service general contractor specialising in commercial and residential construction projects across London and the South East. Over 15 years of experience in new builds, renovations, and fit-outs.",
    keyCapabilities: "General contracting, project management, new builds, renovations, commercial fit-outs, residential developments, site management",
    certifications: "ISO 9001, ISO 14001, CHAS, Constructionline Gold, CSCS",
    equipment: "Excavators, cranes, concrete mixers, scaffolding systems",
    pastProjects: "London Bridge Office Renovation (£2.5M), Greenwich Residential Development (£4M), Canary Wharf Retail Fit-out (£1.8M)",
    postcode: "SE1 9SG",
    address: "45 Tooley Street, London",
    latitude: 51.5033,
    longitude: -0.0825,
    status: "active",
    isSystemCompany: false,
    taxonomyIds: [IDS.taxConstruction, IDS.taxBuildingWorks, IDS.taxCompletion, IDS.taxSitePrep],
  },
  {
    id: IDS.leytisCompany2,
    userId: IDS.leytis,
    companyName: "Meridian Civil Engineering Ltd",
    description: "Specialist civil engineering firm providing structural design, infrastructure works, and ground engineering solutions. Expertise in bridges, highways, and drainage systems.",
    keyCapabilities: "Civil engineering, structural design, bridge construction, highway works, drainage systems, ground engineering, foundation design",
    certifications: "ISO 9001, ISO 45001, ICE Approved, CIRAS",
    equipment: "Piling rigs, survey equipment, CAD/BIM systems, geotechnical testing equipment",
    pastProjects: "M25 Junction Improvement (£3.2M), Thames Barrier Maintenance Works (£1.5M), Crossrail Station Foundation (£5M)",
    postcode: "E14 5AB",
    address: "12 Canary Wharf, London",
    latitude: 51.5054,
    longitude: -0.0235,
    status: "active",
    isSystemCompany: false,
    taxonomyIds: [IDS.taxConstruction, IDS.taxBuildingWorks, IDS.taxEngineering, IDS.taxCivilEng],
  },
  // Marios's company
  {
    id: IDS.mariosCompany1,
    userId: IDS.marios,
    companyName: "Georgiou Consulting & Project Management",
    description: "Construction consultancy and project management firm specialising in large-scale public sector projects. Providing cost management, procurement advisory, and programme management services.",
    keyCapabilities: "Project management, cost consultancy, procurement advisory, programme management, contract administration, risk management, BIM consultancy",
    certifications: "RICS Regulated, APM Corporate Member, ISO 9001, Cyber Essentials Plus",
    equipment: "BIM software suite, project management platforms, cost estimation tools",
    pastProjects: "NHS Hospital Expansion Programme (£15M advisory), Birmingham City Council Housing Programme (£8M PM), Manchester Airport Terminal Works (£12M cost management)",
    postcode: "B1 1BB",
    address: "100 Broad Street, Birmingham",
    latitude: 52.4796,
    longitude: -1.9026,
    status: "active",
    isSystemCompany: false,
    taxonomyIds: [IDS.taxArchEng, IDS.taxEngineering, IDS.taxBusiness],
  },
  // System companies (unowned)
  {
    id: IDS.sysElectrical,
    userId: null,
    companyName: "Spark Electrical Services Ltd",
    description: "Commercial and industrial electrical installation and maintenance company serving the Midlands and North West regions.",
    keyCapabilities: "Electrical installation, testing and inspection, emergency lighting, fire alarm systems, data cabling, solar PV installation",
    certifications: "NICEIC Approved, ECA Member, ISO 9001, Safe Contractor",
    postcode: "M1 2JB",
    address: "55 Portland Street, Manchester",
    latitude: 53.4774,
    longitude: -2.2381,
    status: "active",
    isSystemCompany: true,
    taxonomyIds: [IDS.taxInstallation, IDS.taxElectrical, IDS.taxRepairMaint],
  },
  {
    id: IDS.sysPlumbing,
    userId: null,
    companyName: "AquaFlow Plumbing & Heating Ltd",
    description: "Specialist plumbing, heating, and mechanical services contractor for commercial and residential projects across Yorkshire.",
    keyCapabilities: "Plumbing, heating systems, HVAC installation, gas engineering, underfloor heating, bathroom installations",
    certifications: "Gas Safe Registered, CIPHE Member, ISO 9001, Constructionline Silver",
    postcode: "LS1 4AP",
    address: "22 Park Row, Leeds",
    latitude: 53.7996,
    longitude: -1.5477,
    status: "active",
    isSystemCompany: true,
    taxonomyIds: [IDS.taxInstallation, IDS.taxRepairMaint],
  },
  {
    id: IDS.sysScaffolding,
    userId: null,
    companyName: "Highland Scaffolding Solutions",
    description: "Professional scaffolding erection and hire company operating across Scotland and Northern England. Specialising in complex access solutions.",
    keyCapabilities: "Scaffolding erection, temporary works design, access solutions, edge protection, weather protection systems",
    certifications: "NASC Full Member, CISRS, ISO 45001, CHAS",
    postcode: "EH1 1RE",
    address: "10 Princes Street, Edinburgh",
    latitude: 55.9521,
    longitude: -3.1883,
    status: "active",
    isSystemCompany: true,
    taxonomyIds: [IDS.taxConstruction, IDS.taxSitePrep],
  },
  {
    id: IDS.sysDemolition,
    userId: null,
    companyName: "ClearSite Demolition Ltd",
    description: "Licensed demolition contractor with expertise in controlled demolition, asbestos removal, and site clearance for major development projects.",
    keyCapabilities: "Controlled demolition, asbestos removal, site clearance, crushing and screening, waste management, land remediation",
    certifications: "NFDC Member, ISO 14001, UKAS Licensed Asbestos Removal, CSCS",
    postcode: "BS1 6QF",
    address: "30 Queen Square, Bristol",
    latitude: 51.4536,
    longitude: -2.5975,
    status: "active",
    isSystemCompany: true,
    taxonomyIds: [IDS.taxSitePrep, IDS.taxEnvironmental],
  },
  {
    id: IDS.sysEnvironmental,
    userId: null,
    companyName: "GreenPath Environmental Services",
    description: "Environmental consultancy and remediation company providing ecological surveys, contamination assessments, and sustainability consulting.",
    keyCapabilities: "Environmental impact assessment, contaminated land remediation, ecological surveys, sustainability consulting, waste management consulting",
    certifications: "IEMA Corporate Member, ISO 14001, ISO 9001, SiLC Registered",
    postcode: "CF10 1EP",
    address: "5 Cathedral Road, Cardiff",
    latitude: 51.4816,
    longitude: -3.1908,
    status: "active",
    isSystemCompany: true,
    taxonomyIds: [IDS.taxEnvironmental, IDS.taxBusiness],
  },
  {
    id: IDS.sysIT,
    userId: null,
    companyName: "BuildTech Digital Solutions",
    description: "Construction technology company providing BIM services, digital twin solutions, and construction management software implementation.",
    keyCapabilities: "BIM modelling, digital twin development, construction software implementation, IoT monitoring, drone surveying, 4D scheduling",
    certifications: "Autodesk Gold Partner, ISO 27001, Cyber Essentials Plus, BRE BIM Certification",
    postcode: "CB1 2JD",
    address: "15 Station Road, Cambridge",
    latitude: 52.1951,
    longitude: 0.1370,
    status: "active",
    isSystemCompany: true,
    taxonomyIds: [IDS.taxIT, IDS.taxSoftware, IDS.taxArchEng],
  },
  {
    id: IDS.sysSurveying,
    userId: null,
    companyName: "PrecisionPoint Surveying Ltd",
    description: "Chartered surveying practice offering land surveys, building surveys, measured surveys, and topographic mapping services.",
    keyCapabilities: "Land surveying, building surveys, topographic mapping, measured surveys, GPR scanning, 3D laser scanning, boundary disputes",
    certifications: "RICS Regulated, ISO 9001, TSA Member, CSCS",
    postcode: "OX1 1JD",
    address: "8 Broad Street, Oxford",
    latitude: 51.7542,
    longitude: -1.2593,
    status: "active",
    isSystemCompany: true,
    taxonomyIds: [IDS.taxSurveying, IDS.taxArchEng],
  },
];

const TENDERS = [
  {
    ref: "SEED-001",
    title: "Primary School Renovation Works - Birmingham",
    buyer: "Birmingham City Council",
    cpvCodes: ["45000000", "45200000", "45400000"],
    description: "Complete renovation of Oakwood Primary School including structural repairs, new roof, window replacement, and internal refurbishment. Works to be completed during school holidays.",
    budgetMin: 800000,
    budgetMax: 1200000,
    location: "Birmingham, West Midlands",
    deadlineDays: 45,
    taxonomyIds: [IDS.taxConstruction, IDS.taxBuildingWorks, IDS.taxCompletion],
  },
  {
    ref: "SEED-002",
    title: "Highway Maintenance Contract - Manchester Region",
    buyer: "Transport for Greater Manchester",
    cpvCodes: ["45000000", "45200000"],
    description: "Framework contract for highway maintenance and repair works across the Greater Manchester region. Includes pothole repairs, resurfacing, drainage, and signage.",
    budgetMin: 2000000,
    budgetMax: 5000000,
    location: "Manchester, Greater Manchester",
    deadlineDays: 60,
    taxonomyIds: [IDS.taxConstruction, IDS.taxBuildingWorks],
  },
  {
    ref: "SEED-003",
    title: "Office Building Electrical Rewiring - Leeds",
    buyer: "Leeds City Council",
    cpvCodes: ["45300000", "31000000"],
    description: "Full electrical rewiring of a 6-storey council office building including new distribution boards, LED lighting upgrade, and emergency systems.",
    budgetMin: 350000,
    budgetMax: 500000,
    location: "Leeds, West Yorkshire",
    deadlineDays: 30,
    taxonomyIds: [IDS.taxInstallation, IDS.taxElectrical],
  },
  {
    ref: "SEED-004",
    title: "Hospital Extension Project Management",
    buyer: "NHS Trust - South London",
    cpvCodes: ["71000000", "71300000", "79000000"],
    description: "Project management and cost consultancy services for a major hospital extension programme. Including design coordination, procurement, and contract administration.",
    budgetMin: 500000,
    budgetMax: 800000,
    location: "London, South East",
    deadlineDays: 90,
    taxonomyIds: [IDS.taxArchEng, IDS.taxEngineering, IDS.taxBusiness],
  },
  {
    ref: "SEED-005",
    title: "Residential Development - Greenwich Phase 2",
    buyer: "Greenwich Housing Association",
    cpvCodes: ["45000000", "45200000", "45100000"],
    description: "Construction of 48 affordable housing units including site preparation, foundations, superstructure, and external works. BREEAM Excellent target.",
    budgetMin: 4000000,
    budgetMax: 5500000,
    location: "Greenwich, London",
    deadlineDays: 120,
    taxonomyIds: [IDS.taxConstruction, IDS.taxBuildingWorks, IDS.taxSitePrep],
  },
  {
    ref: "SEED-006",
    title: "Bridge Structural Assessment - Scotland",
    buyer: "Transport Scotland",
    cpvCodes: ["71300000", "71320000"],
    description: "Structural assessment and engineering design services for 12 bridges on the A9 corridor. Including load assessments, condition surveys, and repair designs.",
    budgetMin: 200000,
    budgetMax: 400000,
    location: "Highlands, Scotland",
    deadlineDays: 55,
    taxonomyIds: [IDS.taxEngineering, IDS.taxCivilEng],
  },
  {
    ref: "SEED-007",
    title: "Environmental Remediation - Former Industrial Site",
    buyer: "Bristol City Council",
    cpvCodes: ["90000000", "45100000"],
    description: "Contaminated land remediation of a former gasworks site. Includes soil treatment, groundwater monitoring, and environmental impact assessment.",
    budgetMin: 600000,
    budgetMax: 900000,
    location: "Bristol, South West",
    deadlineDays: 75,
    taxonomyIds: [IDS.taxEnvironmental, IDS.taxSitePrep],
  },
  {
    ref: "SEED-008",
    title: "BIM Implementation for Council Housing Programme",
    buyer: "Cardiff Council",
    cpvCodes: ["72000000", "72200000", "71000000"],
    description: "Implementation of BIM Level 2 across the council's housing development programme. Including software deployment, staff training, and ongoing support.",
    budgetMin: 150000,
    budgetMax: 250000,
    location: "Cardiff, Wales",
    deadlineDays: 40,
    taxonomyIds: [IDS.taxIT, IDS.taxSoftware, IDS.taxArchEng],
  },
  {
    ref: "SEED-009",
    title: "Commercial HVAC Installation - Liverpool",
    buyer: "Liverpool ONE Management",
    cpvCodes: ["45300000", "50000000"],
    description: "Design and installation of new HVAC system for a 20,000 sqm commercial retail complex. Including plant room upgrade and BMS integration.",
    budgetMin: 700000,
    budgetMax: 1100000,
    location: "Liverpool, Merseyside",
    deadlineDays: 65,
    taxonomyIds: [IDS.taxInstallation, IDS.taxRepairMaint],
  },
  {
    ref: "SEED-010",
    title: "Land Survey Services Framework - South East",
    buyer: "Surrey County Council",
    cpvCodes: ["71000000", "71350000"],
    description: "Framework agreement for land surveying, topographic surveys, and boundary surveys across Surrey. Estimated 50+ individual survey commissions over 4 years.",
    budgetMin: 100000,
    budgetMax: 300000,
    location: "Surrey, South East",
    deadlineDays: 35,
    taxonomyIds: [IDS.taxSurveying, IDS.taxArchEng],
  },
  {
    ref: "SEED-011",
    title: "School New Build - Cambridge",
    buyer: "Cambridgeshire County Council",
    cpvCodes: ["45000000", "45200000", "45300000"],
    description: "New build secondary school for 900 pupils including sports hall, science labs, and external landscaping. Net-zero carbon target.",
    budgetMin: 3000000,
    budgetMax: 4500000,
    location: "Cambridge, East of England",
    deadlineDays: 100,
    taxonomyIds: [IDS.taxConstruction, IDS.taxBuildingWorks, IDS.taxInstallation],
  },
  {
    ref: "SEED-012",
    title: "Demolition and Site Clearance - Docklands",
    buyer: "London Legacy Development Corporation",
    cpvCodes: ["45100000", "90000000"],
    description: "Demolition of former warehouse buildings and site clearance for mixed-use development. Includes asbestos survey, removal, and waste management.",
    budgetMin: 400000,
    budgetMax: 650000,
    location: "Newham, London",
    deadlineDays: 28,
    taxonomyIds: [IDS.taxSitePrep, IDS.taxEnvironmental],
  },
  {
    ref: "SEED-013",
    title: "Scaffolding Services Framework - NHS Estates",
    buyer: "NHS Property Services",
    cpvCodes: ["45000000", "45100000"],
    description: "National framework for scaffolding erection, modification, and dismantling across NHS hospital sites. Including complex access solutions for occupied buildings.",
    budgetMin: 500000,
    budgetMax: 1500000,
    location: "National (UK-wide)",
    deadlineDays: 50,
    taxonomyIds: [IDS.taxConstruction, IDS.taxSitePrep],
  },
  {
    ref: "SEED-014",
    title: "Flood Defence Engineering Works - Yorkshire",
    buyer: "Environment Agency",
    cpvCodes: ["45200000", "71300000", "71320000"],
    description: "Design and construction of new flood defence walls and embankments along the River Aire. Including hydrological modelling and environmental monitoring.",
    budgetMin: 1500000,
    budgetMax: 2500000,
    location: "Leeds, West Yorkshire",
    deadlineDays: 85,
    taxonomyIds: [IDS.taxBuildingWorks, IDS.taxEngineering, IDS.taxCivilEng],
  },
  {
    ref: "SEED-015",
    title: "IT Infrastructure Upgrade - Council Offices",
    buyer: "Oxford City Council",
    cpvCodes: ["72000000", "72200000"],
    description: "Upgrade of IT infrastructure across 5 council office locations. Including network redesign, server migration, and cybersecurity improvements.",
    budgetMin: 200000,
    budgetMax: 350000,
    location: "Oxford, South East",
    deadlineDays: 42,
    taxonomyIds: [IDS.taxIT, IDS.taxSoftware],
  },
  {
    ref: "SEED-016",
    title: "Social Housing Refurbishment Programme - Edinburgh",
    buyer: "City of Edinburgh Council",
    cpvCodes: ["45000000", "45300000", "45400000"],
    description: "Refurbishment of 200 social housing units including kitchen/bathroom replacements, window upgrades, external insulation, and electrical rewiring.",
    budgetMin: 2500000,
    budgetMax: 3500000,
    location: "Edinburgh, Scotland",
    deadlineDays: 110,
    taxonomyIds: [IDS.taxConstruction, IDS.taxInstallation, IDS.taxCompletion],
  },
  {
    ref: "SEED-017",
    title: "Construction Cost Consultancy - University Campus",
    buyer: "University of Birmingham",
    cpvCodes: ["71000000", "79000000"],
    description: "Cost consultancy and quantity surveying services for a £50M campus development programme spanning 3 years.",
    budgetMin: 300000,
    budgetMax: 500000,
    location: "Birmingham, West Midlands",
    deadlineDays: 70,
    taxonomyIds: [IDS.taxArchEng, IDS.taxBusiness],
  },
  {
    ref: "SEED-018",
    title: "Solar Panel Installation Programme - Public Buildings",
    buyer: "Welsh Government",
    cpvCodes: ["45300000", "31000000", "90000000"],
    description: "Installation of solar PV systems across 30 public buildings in Wales. Including structural assessments, grid connections, and monitoring systems.",
    budgetMin: 800000,
    budgetMax: 1200000,
    location: "Various locations, Wales",
    deadlineDays: 95,
    taxonomyIds: [IDS.taxInstallation, IDS.taxElectrical, IDS.taxEnvironmental],
  },
  {
    ref: "SEED-019",
    title: "Digital Twin Development - Smart City",
    buyer: "Manchester Digital",
    cpvCodes: ["72000000", "72200000", "71000000"],
    description: "Development of a digital twin platform for Manchester city centre. Including 3D modelling, IoT sensor integration, and data analytics dashboard.",
    budgetMin: 400000,
    budgetMax: 700000,
    location: "Manchester, Greater Manchester",
    deadlineDays: 80,
    taxonomyIds: [IDS.taxIT, IDS.taxSoftware, IDS.taxArchEng],
  },
  {
    ref: "SEED-020",
    title: "Building Maintenance Framework - Government Estate",
    buyer: "Government Property Agency",
    cpvCodes: ["50000000", "50700000", "45300000"],
    description: "4-year framework for reactive and planned maintenance of government buildings across the South East. Covering mechanical, electrical, and fabric maintenance.",
    budgetMin: 1000000,
    budgetMax: 3000000,
    location: "South East, England",
    deadlineDays: 55,
    taxonomyIds: [IDS.taxRepairMaint, IDS.taxInstallation],
  },
];

// ============================================================================
// Matching logic — which companies match which tenders based on shared taxonomies
// ============================================================================

function computeMatchingResults() {
  const results = [];

  // Only create matches for owned companies (the ones users will log in and see)
  const ownedCompanies = COMPANIES.filter((c) => c.userId !== null);

  for (const company of ownedCompanies) {
    for (const tender of TENDERS) {
      const sharedTaxonomies = company.taxonomyIds.filter((t) =>
        tender.taxonomyIds.includes(t),
      );
      if (sharedTaxonomies.length === 0) continue;

      const overlap = sharedTaxonomies.length;
      const maxPossible = Math.max(company.taxonomyIds.length, tender.taxonomyIds.length);
      const capabilityScore = Math.min(95, Math.round((overlap / maxPossible) * 80 + 15));

      // Location bonus: same general area gets higher score
      const companyLocation = (COMPANIES.find((c) => c.id === company.id)?.address || "").toLowerCase();
      const tenderLocation = (tender.location || "").toLowerCase();
      const sameCity =
        (companyLocation.includes("london") && tenderLocation.includes("london")) ||
        (companyLocation.includes("birmingham") && tenderLocation.includes("birmingham")) ||
        (companyLocation.includes("manchester") && tenderLocation.includes("manchester"));
      const locationScore = sameCity ? 85 : 45;

      const certificationScore = company.certifications ? 70 : 45;
      const experienceScore = 55 + (overlap * 8);

      const overallScore = Math.round(
        capabilityScore * 0.4 + locationScore * 0.2 + certificationScore * 0.2 + experienceScore * 0.2,
      );

      const matchReasons = [];
      if (overlap >= 2) matchReasons.push(`Strong CPV code overlap (${overlap} shared categories)`);
      else matchReasons.push(`Partial CPV code match in ${sharedTaxonomies.length} category`);
      if (sameCity) matchReasons.push("Located within tender region");
      if (company.certifications) matchReasons.push("Holds relevant industry certifications");

      const improvementSuggestions = [];
      if (!sameCity) improvementSuggestions.push("Consider establishing local presence in tender region");
      if (overlap < 3) improvementSuggestions.push("Expand capabilities to cover additional tender requirements");
      if (!company.certifications?.includes("ISO 14001")) improvementSuggestions.push("Consider obtaining ISO 14001 environmental certification");

      results.push({
        id: randomUUID(),
        companyId: company.id,
        tenderId: null, // Will be resolved by tender ref
        tenderRef: tender.ref,
        overallScore: Math.min(95, overallScore),
        capabilityScore,
        experienceScore: Math.min(90, experienceScore),
        locationScore,
        certificationScore,
        matchReasons,
        improvementSuggestions,
        isBookmarked: overallScore > 70 && Math.random() > 0.6,
      });
    }
  }

  return results;
}

// ============================================================================
// Insert helpers
// ============================================================================

async function checkTablesExist(client) {
  const res = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('user', 'profiles', 'companies')
  `);
  if (res.rows.length === 0) {
    throw new Error(
      'Tables not found. Run "npm run db:migrate" first, or use "npm run db:fresh" for reset + migrate + seed.',
    );
  }
}

async function seedUsers(client, passwordHash) {
  console.log("  Seeding users...");
  for (const u of USERS) {
    // Insert into "user" table
    await client.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role)
       VALUES ($1, $2, $3, true, NOW(), NOW(), $4)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.name, u.email, u.role],
    );

    // Insert into "account" table (Better-Auth credential provider)
    await client.query(
      `INSERT INTO "account" (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [randomUUID(), u.id, u.id, passwordHash],
    );

    // Insert into "profiles" table
    await client.query(
      `INSERT INTO "profiles" (id, user_id, first_name, last_name, email, approval_status, onboarding_step, onboarding_completed_at, account_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'approved', 5, NOW(), 'company', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), u.id, u.firstName, u.lastName, u.email],
    );

    // Insert into "user_roles" table
    await client.query(
      `INSERT INTO "user_roles" (id, user_id, role, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), u.id, u.appRole],
    );
  }
  console.log(`  ✓ ${USERS.length} users created`);
}

async function seedTaxonomies(client) {
  console.log("  Seeding taxonomies...");
  for (const t of TAXONOMIES) {
    await client.query(
      `INSERT INTO "taxonomies" (id, name, parent_id, level, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.name, t.parentId || null, t.level, `CPV ${t.cpv}: ${t.name}`],
    );
  }
  console.log(`  ✓ ${TAXONOMIES.length} taxonomies created`);
}

async function seedCompanies(client) {
  console.log("  Seeding companies...");
  for (const c of COMPANIES) {
    await client.query(
      `INSERT INTO "companies" (id, user_id, company_name, description, key_capabilities, certifications, equipment, past_projects, postcode, address, latitude, longitude, status, is_system_company, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        c.id,
        c.userId,
        c.companyName,
        c.description,
        c.keyCapabilities,
        c.certifications || null,
        c.equipment || null,
        c.pastProjects || null,
        c.postcode,
        c.address,
        c.latitude,
        c.longitude,
        c.status,
        c.isSystemCompany,
      ],
    );

    // Link company to taxonomies
    for (const taxId of c.taxonomyIds) {
      await client.query(
        `INSERT INTO "company_taxonomies" (id, company_id, taxonomy_id, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [randomUUID(), c.id, taxId],
      );
    }

    // Create company_members for owned companies
    if (c.userId) {
      await client.query(
        `INSERT INTO "company_members" (id, company_id, user_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'owner', 'active', NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [randomUUID(), c.id, c.userId],
      );
    }
  }
  console.log(`  ✓ ${COMPANIES.length} companies created`);
}

async function seedTenders(client) {
  console.log("  Seeding tenders...");

  // Build a map of ref -> generated tender ID
  const tenderIdMap = {};

  for (const t of TENDERS) {
    const tenderId = randomUUID();
    tenderIdMap[t.ref] = tenderId;

    await client.query(
      `INSERT INTO "tenders" (id, reference_number, title, buyer, cpv_codes, description, budget_min, budget_max, location, deadline, publication_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + INTERVAL '${t.deadlineDays} days', NOW() - INTERVAL '7 days', 'open', NOW(), NOW())
       ON CONFLICT (reference_number) DO UPDATE SET deadline = NOW() + INTERVAL '${t.deadlineDays} days'`,
      [
        tenderId,
        t.ref,
        t.title,
        t.buyer,
        t.cpvCodes,
        t.description,
        t.budgetMin,
        t.budgetMax,
        t.location,
      ],
    );

    // Link tender to taxonomies
    for (const taxId of t.taxonomyIds) {
      await client.query(
        `INSERT INTO "tender_taxonomies" (id, tender_id, taxonomy_id, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [randomUUID(), tenderId, taxId],
      );
    }
  }

  console.log(`  ✓ ${TENDERS.length} tenders created`);
  return tenderIdMap;
}

async function seedMatchingResults(client, tenderIdMap) {
  console.log("  Seeding matching results...");
  const matches = computeMatchingResults();
  let count = 0;

  for (const m of matches) {
    const tenderId = tenderIdMap[m.tenderRef];
    if (!tenderId) continue;

    await client.query(
      `INSERT INTO "matching_results" (id, company_id, tender_id, overall_score, capability_score, experience_score, location_score, certification_score, match_reasons, improvement_suggestions, is_bookmarked, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        m.id,
        m.companyId,
        tenderId,
        m.overallScore,
        m.capabilityScore,
        m.experienceScore,
        m.locationScore,
        m.certificationScore,
        m.matchReasons,
        m.improvementSuggestions,
        m.isBookmarked,
      ],
    );
    count++;
  }

  console.log(`  ✓ ${count} matching results created`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is missing. Check .env.local.");
    process.exit(1);
  }

  const forceReset = process.env.FORCE_LOCAL_DB_RESET === "true";
  if (!isLikelyLocalDatabase(databaseUrl) && !forceReset) {
    console.error("Refusing to seed a non-local database.");
    console.error(
      "Set FORCE_LOCAL_DB_RESET=true only if you intentionally want this operation.",
    );
    process.exit(1);
  }

  console.log("Seeding local database...");
  console.log("─".repeat(50));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await checkTablesExist(client);

    // Hash the shared password once
    const passwordHash = await bcrypt.hash("password123", 10);

    await seedUsers(client, passwordHash);
    await seedTaxonomies(client);
    await seedCompanies(client);
    const tenderIdMap = await seedTenders(client);
    await seedMatchingResults(client, tenderIdMap);

    console.log("─".repeat(50));
    console.log("Seed complete!");
    console.log("");
    console.log("Login credentials (all passwords: password123):");
    console.log("  admin@tndrx.dev   (superadmin)");
    console.log("  marios@tndrx.dev  (sme-owner, 1 company)");
    console.log("  leytis@tndrx.dev  (sme-owner, 2 companies)");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
