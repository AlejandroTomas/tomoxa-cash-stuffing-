/** Normaliza para comparar sin mayúsculas ni acentos: "Óscar" ~ "oscar". */
export const normalizeText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
