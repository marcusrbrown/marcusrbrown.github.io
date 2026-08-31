import {spawnSync} from 'node:child_process'
import process from 'node:process'

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(pnpmCommand, ['run', 'build'], {
  env: {
    ...process.env,
    BLOG_SNAPSHOT: 'tests/fixtures/blog-snapshot.json',
  },
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Unable to run ${pnpmCommand} run build: ${result.error.message}`)
  process.exitCode = 1
} else {
  process.exitCode = result.status ?? 1
}
