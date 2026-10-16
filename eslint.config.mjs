import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ─── Fronteras de la arquitectura (ver AGENTS.md y .ia/context/) ─────────────
//
// En la configuración plana, si dos bloques configuran `no-restricted-imports`
// para el mismo archivo, el último REEMPLAZA al anterior (no se suman). Por eso
// cada grupo de archivos lleva la lista completa de patrones que le aplican.

/** Lo privado de un feature. Dentro del propio feature se importa con rutas relativas. */
const FEATURE_PRIVATE = {
  group: ["@/features/*/repositories/*", "@/features/*/actions/*"],
  message:
    "Es privado de ese feature. Acceso a datos: usa su services/. Thunks: impórtalos desde su slice. Dentro del mismo feature usa rutas relativas.",
};

/** Acceso a datos crudo: solo desde repositories/ (o un archivo de datos, nunca un componente). */
const HTTP_CLIENT = {
  group: ["@/core/http"],
  message: "Un componente/hook no toca datos: llama a un service (o a un thunk) y el repository usa core/http.",
};

/** components/ es UI sin dominio. */
const ANY_FEATURE = {
  group: ["@/features/*", "@/features/*/**"],
  message: "components/ no conoce dominios. Si necesita un feature, el componente es de ese feature.",
};

/** core/ es infraestructura: no depende de nada de arriba. */
const UPPER_LAYERS = {
  group: ["@/features/*", "@/features/*/**", "@/components/*", "@/components/**", "@/app/*", "@/app/**", "@/store", "@/store/*", "@/hooks/*"],
  message: "core/ no depende de features, components, app, store ni hooks. La flecha va al revés.",
};

const restrict = (...patterns) => ["error", { patterns }];
const TESTS = ["**/__tests__/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Los errores van por `reportError` (core/logger). `warn`/`error` los usa el propio logger.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // `_algo` = descartado a propósito (p. ej. al quitar un campo con destructuring).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  // Del más general al más específico: el último que aplica gana.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: TESTS,
    rules: { "no-restricted-imports": restrict(FEATURE_PRIVATE) },
  },
  {
    files: ["src/**/*.tsx", "src/hooks/**/*.ts"],
    ignores: TESTS,
    rules: { "no-restricted-imports": restrict(FEATURE_PRIVATE, HTTP_CLIENT) },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: TESTS,
    rules: { "no-restricted-imports": restrict(FEATURE_PRIVATE, HTTP_CLIENT, ANY_FEATURE) },
  },
  {
    files: ["src/core/**/*.{ts,tsx}"],
    ignores: TESTS,
    rules: { "no-restricted-imports": restrict(UPPER_LAYERS) },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
