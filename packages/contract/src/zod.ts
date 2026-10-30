import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

const globalState = globalThis as { __d2sZodOpenApi?: boolean };
if (!globalState.__d2sZodOpenApi) {
  extendZodWithOpenApi(z);
  globalState.__d2sZodOpenApi = true;
}

export { z };
