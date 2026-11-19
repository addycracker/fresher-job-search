import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { handler } from './handler.js';
import { message } from '../../../src/messages.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error(message('discoveryLocalUsage'));
  const batchSize = args[0] === undefined ? undefined : z.coerce.number().int().positive().parse(args[0]);
  for (const file of ['.env.development', '.env']) if (existsSync(file)) process.loadEnvFile(file);
  console.log(JSON.stringify({ event: 'discovery_cli_started', entrypoint: fileURLToPath(import.meta.url), cwd: process.cwd() }));
  // Local execution is always read-only. Real writes require a deliberate handler invocation.
  const summary = await handler({ dryRun: true, ...(batchSize === undefined ? {} : { batchSize }) });
  if (summary.status === 'failed') process.exitCode = 1;
}

main().catch(() => {
  console.error(message('discoveryLocalUsage'));
  process.exitCode = 1;
});
