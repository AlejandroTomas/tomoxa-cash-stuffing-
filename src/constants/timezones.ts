export type TimezoneOption = {
  value: string;
  label: string;
};

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "America/Mexico_City", label: "Mexico (CDMX) - America/Mexico_City" },
  { value: "America/Cancun", label: "Mexico (Cancun) - America/Cancun" },
  { value: "America/Merida", label: "Mexico (Merida) - America/Merida" },
  { value: "America/Monterrey", label: "Mexico (Monterrey) - America/Monterrey" },
  { value: "America/Chihuahua", label: "Mexico (Chihuahua) - America/Chihuahua" },
  { value: "America/Hermosillo", label: "Mexico (Hermosillo) - America/Hermosillo" },
  { value: "America/Tijuana", label: "Mexico (Tijuana) - America/Tijuana" },
  { value: "America/Bogota", label: "Colombia - America/Bogota" },
  { value: "America/Lima", label: "Peru - America/Lima" },
  { value: "America/Guatemala", label: "Guatemala - America/Guatemala" },
  { value: "America/El_Salvador", label: "El Salvador - America/El_Salvador" },
  { value: "America/Costa_Rica", label: "Costa Rica - America/Costa_Rica" },
  { value: "America/Panama", label: "Panama - America/Panama" },
  { value: "America/Caracas", label: "Venezuela - America/Caracas" },
  { value: "America/Santiago", label: "Chile - America/Santiago" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina - America/Argentina/Buenos_Aires" },
  { value: "America/Sao_Paulo", label: "Brasil - America/Sao_Paulo" },
  { value: "UTC", label: "UTC - UTC" },
];
