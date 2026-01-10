import 'dotenv/config';
import { spawn } from 'child_process';

async function runScript(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running: npm run ${name}`);
    console.log('='.repeat(50));

    const child = spawn('npm', ['run', name], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${name} exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function main() {
  console.log('Starting daily generation...');
  console.log(`Date: ${new Date().toISOString()}`);

  try {
    // Step 1: Fetch Discord messages
    await runScript('fetch-discord');

    // Step 2: Summarize with AI
    await runScript('summarize');

    console.log('\n' + '='.repeat(50));
    console.log('Daily generation complete!');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\nDaily generation failed:', error);
    process.exit(1);
  }
}

main();
