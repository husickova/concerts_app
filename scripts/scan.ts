/**
 * Ruční / cronové spuštění denního scanu bez HTTP:
 *   npm run scan
 * Systémový cron (1× denně v 8:00):
 *   0 8 * * * cd /path/to/app && npm run scan >> scan.log 2>&1
 */
import { runScan } from "../lib/scan";

runScan()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
