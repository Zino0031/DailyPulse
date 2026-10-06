/// <reference types="nativewind/types" />

// Side-effect CSS imports (e.g. `import '../global.css'`) need an ambient
// declaration. Expo normally provides one via the generated, gitignored
// `expo-env.d.ts`, which does not exist on fresh CI checkouts — so declare
// it here to keep `tsc --noEmit` green everywhere.
declare module '*.css';
