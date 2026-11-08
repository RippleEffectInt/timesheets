import { copyFile, mkdir } from "node:fs/promises";
await mkdir(new URL("../api/shared/", import.meta.url), { recursive: true });
for (const file of ["domain.js", "service.js", "repository.js"])
  await copyFile(
    new URL(`../src/${file}`, import.meta.url),
    new URL(`../api/shared/${file}`, import.meta.url),
  );
