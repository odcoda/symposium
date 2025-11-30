import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distDir = resolve(projectRoot, 'dist')
const pagesRepoDir = resolve(projectRoot, '..', '..', 'odcoda.github.io')
const targetDir = resolve(pagesRepoDir, 'symposium')

const ensurePagesRepo = () => {
  if (!existsSync(pagesRepoDir)) {
    throw new Error(`Expected GitHub Pages repo at ${pagesRepoDir}`)
  }
}

const buildApp = () => {
  console.log('Building Symposium web app...')
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
  if (!existsSync(distDir)) {
    throw new Error('Build output not found (dist missing).')
  }
}

const copyBuild = () => {
  console.log(`Copying dist -> ${targetDir}`)
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })
  cpSync(distDir, targetDir, { recursive: true })
}

const main = () => {
  ensurePagesRepo()
  buildApp()
  copyBuild()
  console.log('Deploy complete. Commit and push odcoda.github.io to publish.')
}

main()
