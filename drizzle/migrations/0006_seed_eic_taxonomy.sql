-- Seed EIC (European Innovation Council) standard taxonomy.
-- Level 1 = 15 categories, Level 2 = subcategories. No level 3.

-- Clear existing taxonomy links (FKs reference taxonomies)
DELETE FROM public.tender_taxonomies;--> statement-breakpoint
DELETE FROM public.company_taxonomies;--> statement-breakpoint
DELETE FROM public.taxonomies;--> statement-breakpoint

-- Level 1: Main categories (15)
INSERT INTO public.taxonomies (name, level, description) VALUES
  ('Agriculture', 1, 'EIC taxonomy category'),
  ('Biotechnology', 1, 'EIC taxonomy category'),
  ('Construction, Civil engineering, Infrastructures', 1, 'EIC taxonomy category'),
  ('Consumer products and services', 1, 'EIC taxonomy category'),
  ('Earth and related environmental sciences', 1, 'EIC taxonomy category'),
  ('Education and Culture', 1, 'EIC taxonomy category'),
  ('Energy', 1, 'EIC taxonomy category'),
  ('Engineering and Technology', 1, 'EIC taxonomy category'),
  ('Food and Beverages', 1, 'EIC taxonomy category'),
  ('Health', 1, 'EIC taxonomy category'),
  ('Information and Communication Technology (ICT)', 1, 'EIC taxonomy category'),
  ('Public Sector Innovation', 1, 'EIC taxonomy category'),
  ('Security', 1, 'EIC taxonomy category'),
  ('Space', 1, 'EIC taxonomy category'),
  ('Transport and Mobility', 1, 'EIC taxonomy category');--> statement-breakpoint

-- Level 2: Agriculture
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Agriculture' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Agronomy'),
  ('Animal and Dairy science'),
  ('Aquaculture'),
  ('Aquatic biology, Hydrobiology'),
  ('Fishery'),
  ('Forestry'),
  ('Horticulture, viticulture'),
  ('Husbandry'),
  ('Paper and wood'),
  ('Plant breeding and plant protection'),
  ('Precision agriculture'),
  ('Soil management')
) AS v(name);--> statement-breakpoint

-- Level 2: Biotechnology
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Biotechnology' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Biochemistry'),
  ('Bacteriology'),
  ('Bioeconomy'),
  ('Biohazards, biological containment, biosafety, biosecurity'),
  ('Bioinformatics'),
  ('Bioproducts (biomaterials, bioplastics, biofuels)'),
  ('Bioremediation, biodegradation'),
  ('Biotechnology (non-medical), bioreactors, applied microbiology'),
  ('DNA synthesis, modification, repair, recombination'),
  ('Genetics and heredity'),
  ('Human biology'),
  ('Microbiology'),
  ('Neurochemistry and neuropharmacology'),
  ('Plant sciences, botany'),
  ('Reproductive biology'),
  ('Serology'),
  ('Tissue culture'),
  ('Zoology'),
  ('Bioprocessing technologies (biocatalysis, fermentation)')
) AS v(name);--> statement-breakpoint

-- Level 2: Construction, Civil engineering, Infrastructures
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Construction, Civil engineering, Infrastructures' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Glass, ceramics & construction material'),
  ('Architecture, smart buildings, smart cities'),
  ('Civil engineering, maritime/hydraulic engineering'),
  ('Construction engineering, Municipal and structural engineering'),
  ('Low/nearly zero & energy positive buildings'),
  ('Urban studies (Planning and development)')
) AS v(name);--> statement-breakpoint

-- Level 2: Consumer products and services
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Consumer products and services' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Distribution and logistics'),
  ('Electronic commerce (eCommerce)'),
  ('Household products'),
  ('Leisure products'),
  ('Leisure services'),
  ('Personal products and services'),
  ('Retail, wholesale or distribution'),
  ('Service innovation'),
  ('Supply chain management'),
  ('Textiles, apparel and luxury goods'),
  ('Tourism / Travel')
) AS v(name);--> statement-breakpoint

-- Level 2: Earth and related environmental sciences
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Earth and related environmental sciences' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Environmental protection'),
  ('Atmospheric chemistry, air pollution'),
  ('Circular economy'),
  ('Climatology and climate change'),
  ('Decontamination and de-pollution'),
  ('Ecology'),
  ('Environmental and Green Technologies'),
  ('Flood forecasting'),
  ('Geographical information systems, cartography'),
  ('Geo-information and spatial data analysis'),
  ('Geology, tectonics, volcanology'),
  ('Hydrology'),
  ('Marine biology'),
  ('Marine ecosystems and processes'),
  ('Meteorology'),
  ('Mineralogy'),
  ('Natural resources exploration and exploitation'),
  ('Waste management'),
  ('Waste recycling'),
  ('Wastewater treatment'),
  ('Water')
) AS v(name);--> statement-breakpoint

-- Level 2: Education and Culture
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Education and Culture' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Education'),
  ('Psychology'),
  ('Social Media'),
  ('Arts (performing arts, music)'),
  ('Behavioural change'),
  ('Cultural heritage, cultural memory'),
  ('Design innovation'),
  ('Informal education'),
  ('Innovation and diversity'),
  ('Languages and Literature'),
  ('Life long learning'),
  ('Media and communications'),
  ('Social issues'),
  ('Teaching materials')
) AS v(name);--> statement-breakpoint

-- Level 2: Energy
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Energy' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Biodiesel'),
  ('Bioenergy'),
  ('Biofuels'),
  ('Biogas'),
  ('Biomass'),
  ('Biomethane'),
  ('Domestic appliances'),
  ('Electricity Transmission/Distribution'),
  ('Electrochemistry, batteries and fuel cells'),
  ('Energy Economics'),
  ('Energy Efficiency'),
  ('Energy management'),
  ('Energy systems (production, distribution, application)'),
  ('Smart energy, smart grids, wireless energy transfer'),
  ('Fuel Production & Distribution'),
  ('Hydrogen'),
  ('Low/zero carbon communities'),
  ('Natural gas'),
  ('Photovoltaics'),
  ('Renewable energy sources'),
  ('Solar cooling'),
  ('Solar thermal')
) AS v(name);--> statement-breakpoint

-- Level 2: Engineering and Technology
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Engineering and Technology' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Manufacturing and processing'),
  ('Acoustics'),
  ('Audio engineering, reliability analysis'),
  ('Automation and control systems'),
  ('Chemical engineering, technical chemistry'),
  ('Communication engineering and systems'),
  ('Control engineering'),
  ('Electrical and electronic engineering'),
  ('Electromagnetism'),
  ('Electromechanical engineering'),
  ('Electronics, photonics'),
  ('Graphene, layered material'),
  ('Industrial bioengineering'),
  ('Materials engineering'),
  ('Mechanical engineering'),
  ('Metallurgy'),
  ('Metrology and measurement'),
  ('Micro (system) engineering'),
  ('Nanotechnology, nano-materials'),
  ('Novel Materials'),
  ('Ocean engineering'),
  ('Optics (laser optics and quantum optics)'),
  ('Organic electronics'),
  ('Photonics'),
  ('Porous Materials'),
  ('Production technology, process engineering'),
  ('Propulsion systems engineering'),
  ('Robotics'),
  ('Semiconductors'),
  ('Solid state materials'),
  ('Superconductivity'),
  ('Thermodynamics')
) AS v(name);--> statement-breakpoint

-- Level 2: Food and Beverages
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Food and Beverages' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Agricultural products'),
  ('Brewers'),
  ('Distillers and vintners'),
  ('Food additives'),
  ('Food contamination'),
  ('Food packaging'),
  ('Food preservation'),
  ('Food quality'),
  ('Food safety'),
  ('Food storage'),
  ('Food technology'),
  ('Secure food chain and wealth products'),
  ('Soft drinks')
) AS v(name);--> statement-breakpoint

-- Level 2: Health
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Health' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Ageing'),
  ('Biomarkers'),
  ('Cardiac and Cardiovascular systems'),
  ('Clinical medicine'),
  ('Critical care medicine and Emergency medicine'),
  ('Dentistry, oral surgery and medicine'),
  ('Dermatology and venereal diseases'),
  ('Diagnostic tools (genetic, imaging)'),
  ('Drugs'),
  ('eHealth'),
  ('Endocrinology and metabolism'),
  ('Gene therapy'),
  ('Geriatrics and gerontology'),
  ('Healthcare system'),
  ('Health-related biotechnology'),
  ('Human genetics'),
  ('Immunology'),
  ('Infectious diseases'),
  ('Medical devices'),
  ('Neurodegenerative disorders'),
  ('Obstetrics and gynaecology'),
  ('Oncology'),
  ('Ophthalmology'),
  ('Orthopaedics'),
  ('Paediatrics'),
  ('Pathology'),
  ('Patient care'),
  ('Personalised treatment'),
  ('Pharmacology and pharmacy'),
  ('Psychiatry'),
  ('Radiology, nuclear medicine and medical imaging'),
  ('Rehabilitation'),
  ('Respiratory systems'),
  ('Rheumatology'),
  ('Robotics for healthcare'),
  ('Surgery'),
  ('Toxicology'),
  ('Transplantation'),
  ('Urology and nephrology'),
  ('Vaccines'),
  ('Virology'),
  ('Wellbeing')
) AS v(name);--> statement-breakpoint

-- Level 2: Information and Communication Technology (ICT)
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Information and Communication Technology (ICT)' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Artificial intelligence'),
  ('Blockchain and Distributed Ledger Technology (DLT)'),
  ('Internet of Things, embedded systems'),
  ('Big data'),
  ('Extended Reality (XR)'),
  ('Advanced computing'),
  ('Algorithms and complexity'),
  ('Unmanned aircraft (Drone)'),
  ('Cloud computing'),
  ('Communication networks, media'),
  ('Communication technology, high-frequency technology'),
  ('Computational engineering'),
  ('Computer graphics'),
  ('Computer hardware and architecture'),
  ('Computer sciences, information science'),
  ('Cryptology, security, privacy, quantum crypto'),
  ('Cyber-physical systems'),
  ('Cybersecurity'),
  ('Data protection and privacy'),
  ('Digital games, gamification, serious games'),
  ('Digital services'),
  ('E-learning, user modelling, collaborative systems'),
  ('5G network technology'),
  ('Fintech (Financial technology)'),
  ('Human computer interaction and interface'),
  ('Assistive Technologies'),
  ('Internet Services & Applications'),
  ('Machine learning, statistical data processing'),
  ('Networks (communication, sensor, robots)'),
  ('Neuroimaging and computational neuroscience'),
  ('Ontologies, neural networks, genetic programming'),
  ('Scientific computing, simulation and modelling'),
  ('Software engineering, operating systems')
) AS v(name);--> statement-breakpoint

-- Level 2: Public Sector Innovation
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Public Sector Innovation' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Business model innovation'),
  ('Corporate Social responsibility'),
  ('Human resource management'),
  ('Open data'),
  ('Open innovation'),
  ('Public administration innovation'),
  ('Social innovation')
) AS v(name);--> statement-breakpoint

-- Level 2: Security
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Security' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Chemical, Biological, Radiological and Nuclear (CBRN) protection'),
  ('Crisis management'),
  ('Critical infrastructure, emergency systems'),
  ('Detection technology'),
  ('Explosives removal'),
  ('Forensic technologies'),
  ('Identification'),
  ('Information Security Technologies'),
  ('Interoperable secured communications'),
  ('Navigation, guidance, control and tracking'),
  ('Networks and information security systems'),
  ('Protection'),
  ('Risk management'),
  ('Search and detection'),
  ('Surveillance')
) AS v(name);--> statement-breakpoint

-- Level 2: Space
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Space' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Earth Observation / Services and applications'),
  ('Flight Dynamics / Position, Navigation, and Timing'),
  ('Global Satellite Navigation System (GNSS)'),
  ('Instrumentation - telescopes, detectors'),
  ('Launchers'),
  ('On-Board Data Systems'),
  ('Orbital transportation and re-entry systems'),
  ('Remote sensing'),
  ('RF Payload and Systems'),
  ('Satellites and Probes'),
  ('Space data exploitation'),
  ('Space Debris'),
  ('Space services and products'),
  ('Spacecraft'),
  ('Supporting Propulsion Technologies'),
  ('Telecommunications')
) AS v(name);--> statement-breakpoint

-- Level 2: Transport and Mobility
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT name, (SELECT id FROM public.taxonomies WHERE name = 'Transport and Mobility' AND level = 1 LIMIT 1), 2, NULL
FROM (VALUES
  ('Aircraft Avionics, Systems & Equipment'),
  ('Airports'),
  ('Automation'),
  ('Automotive'),
  ('Logistics'),
  ('Maritime and infrastructure'),
  ('Maritime transport'),
  ('Multimodality'),
  ('Network infrastructures'),
  ('Propulsion'),
  ('Rail infrastructure'),
  ('Rail Transport'),
  ('Road infrastructure'),
  ('Road transport'),
  ('Sea vessels'),
  ('Sustainable transport'),
  ('Air traffic management (ATM)'),
  ('Transport engineering'),
  ('Urban transport'),
  ('Vehicle Technology')
) AS v(name);
