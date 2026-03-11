export const UNIT_OPTIONS = [
  { value: "kg", label: "Kilogramos (kg)" },
  { value: "gr", label: "Gramos (gr)" },
  { value: "mt", label: "Metros (m)" },
  { value: "cm", label: "Centímetros (cm)" },
  { value: "l", label: "Litros (l)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "m2", label: "Metro cuadrado (m²)" },
  { value: "cm2", label: "Centímetro cuadrado (cm²)" },
  { value: "m3", label: "Metro cúbico (m³)" },
  { value: "cm3", label: "Centímetro cúbico (cm³)" },
  { value: "u", label: "Unidad (u)" },
] as const;

const VALID_UNIT_VALUES = UNIT_OPTIONS.map((o) => o.value);

export function isValidUnit(value: string): boolean {
  return VALID_UNIT_VALUES.includes(value as (typeof VALID_UNIT_VALUES)[number]);
}
