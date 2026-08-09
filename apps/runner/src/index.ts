import { loadRunnerConfig } from './env.js';
import { runDailyCheck } from './run.js';

const config = loadRunnerConfig();

runDailyCheck(config)
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('runner failed', error instanceof Error ? error.message : error);
    process.exit(1);
  });
