import "server-only";

import { parseProductionEnvironment } from "./production_environment";

let cachedEnvironment: ReturnType<typeof parseProductionEnvironment> | undefined;

export function getProductionEnvironment() {
  cachedEnvironment ??= parseProductionEnvironment(process.env);
  return cachedEnvironment;
}
