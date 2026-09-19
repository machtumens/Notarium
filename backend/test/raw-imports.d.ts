// Vite `?raw` imports (used by setup.ts to load migration SQL as strings).
declare module '*.sql?raw' {
  const sql: string;
  export default sql;
}
