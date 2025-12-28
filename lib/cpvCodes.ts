// Common CPV code mappings
// CPV (Common Procurement Vocabulary) codes used in EU/UK public procurement
export const cpvCodeNames: Record<string, string> = {
  // Construction
  '45000000': 'Construction work',
  '45100000': 'Site preparation work',
  '45200000': 'Works for complete or part construction and civil engineering work',
  '45300000': 'Building installation work',
  '45400000': 'Building completion work',
  
  // Services
  '71000000': 'Architectural, construction, engineering and inspection services',
  '71200000': 'Architectural and related services',
  '71300000': 'Engineering services',
  '72000000': 'IT services: consulting, software development, Internet and support',
  '79000000': 'Business services: law, marketing, consulting, recruitment, printing and security',
  '80000000': 'Education and training services',
  '85000000': 'Health and social work services',
  '90000000': 'Sewage, refuse, cleaning and environmental services',
  
  // Supplies
  '30000000': 'Office and computing machinery, equipment and supplies',
  '31000000': 'Electrical machinery, apparatus, equipment and consumables',
  '32000000': 'Radio, television, communication, telecommunication and related equipment',
  '33000000': 'Medical equipments, pharmaceuticals and personal care products',
  '34000000': 'Transport equipment and auxiliary products to transportation',
  '35000000': 'Security, fire-fighting, police and defence equipment',
  
  // Healthcare
  '33100000': 'Medical equipments',
  '33600000': 'Pharmaceutical products',
  '33700000': 'Personal care products',
  
  // IT & Software
  '48000000': 'Software package and information systems',
  '72200000': 'Software programming and consultancy services',
  '72400000': 'Internet services',
  
  // Maintenance & Support
  '50000000': 'Repair and maintenance services',
  '50700000': 'Repair and maintenance services of building installations',
  '50800000': 'Miscellaneous repair and maintenance services',
  
  // Facilities & Property
  '70000000': 'Real estate services',
  '77000000': 'Agricultural, forestry, horticultural, aquacultural and apicultural services',
  '98000000': 'Other community, social and personal services',
};

export function getCpvCodeName(code: string): string {
  // Try to find exact match
  if (cpvCodeNames[code]) {
    return cpvCodeNames[code];
  }
  
  // Try to find parent code (first 2 digits)
  const parentCode = code.substring(0, 8).padEnd(8, '0');
  if (cpvCodeNames[parentCode]) {
    return cpvCodeNames[parentCode];
  }
  
  // Return formatted code if no match
  return `CPV ${code}`;
}

export function formatCpvCode(code: string): { code: string; name: string } {
  return {
    code,
    name: getCpvCodeName(code)
  };
}
