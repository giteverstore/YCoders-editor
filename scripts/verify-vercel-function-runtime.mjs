import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const outputRoot = resolve('.vercel/output/functions')
const functionDirectories = findDirectories(outputRoot, '.func')
const outputConfig = JSON.parse(readFileSync(resolve('.vercel/output/config.json'), 'utf8'))

if (functionDirectories.length !== 2) {
  throw new Error(`Expected exactly 2 generated Vercel functions, found ${functionDirectories.length}`)
}

if (!outputConfig.routes.some((route) => route.src?.includes('/api/v2/gateway') && route.dest?.startsWith('/api/internal-v2-gateway/dispatch?gatewayPath=$1'))) {
  throw new Error('Generated Vercel routes do not dispatch the public gateway path to the isolated gateway function')
}
if (!outputConfig.routes.some((route) => route.src?.includes('/api/v2') && !route.src?.includes('/gateway') && route.dest?.startsWith('/api/internal-v2-admin/dispatch?adminPath=$1'))) {
  throw new Error('Generated Vercel routes do not dispatch public Admin paths to the consolidated Admin function')
}
const gatewayIndex = outputConfig.routes.findIndex((route) => route.dest?.startsWith('/api/internal-v2-gateway/dispatch?gatewayPath=$1'))
const adminIndex = outputConfig.routes.findIndex((route) => route.dest?.startsWith('/api/internal-v2-admin/dispatch?adminPath=$1'))
if (gatewayIndex < 0 || adminIndex < 0 || gatewayIndex >= adminIndex) throw new Error('Gateway rewrite must precede the general Admin rewrite')

const expectedEntrypoints = [
  ['api/internal-v2-admin/[...path].func', 'api/internal-v2-admin/[...path].js'],
  ['api/internal-v2-gateway/[...path].func', 'api/internal-v2-gateway/[...path].js'],
]

for (const [functionPath, entryPath] of expectedEntrypoints) {
  const functionRoot = join(outputRoot, ...functionPath.split('/'))
  const entrypoint = join(functionRoot, ...entryPath.split('/'))
  if (!existsSync(entrypoint)) throw new Error(`Missing generated entrypoint: ${entrypoint}`)

  for (const file of findFiles(functionRoot, '.js')) {
    if (file.includes(`${join('node_modules', '')}`)) continue
    const source = readFileSync(file, 'utf8')
    for (const specifier of relativeSpecifiers(source)) {
      if (!/\.(?:js|mjs|cjs|json)$/.test(specifier)) {
        throw new Error(`Extensionless runtime import in ${relative(functionRoot, file)}: ${specifier}`)
      }
      const target = resolve(dirname(file), specifier)
      if (!existsSync(target)) {
        throw new Error(`Unresolved runtime import in ${relative(functionRoot, file)}: ${specifier}`)
      }
    }
  }

  await import(`${pathToFileURL(entrypoint).href}?resolution-check=${Date.now()}`)
}

console.log('Verified 2 Vercel functions: all local ESM imports resolve and both entry modules load.')

function findDirectories(root, suffix) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => join(entry.parentPath, entry.name))
}

function findFiles(root, suffix) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(entry.parentPath, entry.name))
}

function relativeSpecifiers(source) {
  const values = []
  const pattern = /(?:from\s+|import\s*(?:\(\s*)?)["'](\.{1,2}\/[^"']+)["']/g
  for (const match of source.matchAll(pattern)) values.push(match[1])
  return values
}
