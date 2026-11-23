import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { moduleSections, readSection, replaceSection } from './prd-sections.mjs'
import { createPrdHistory } from './prd-history.mjs'

const root = new URL('../', import.meta.url)
const text = await fs.readFile(new URL('PRD.zh-CN.md', root), 'utf8')
const manifest = JSON.parse(await fs.readFile(new URL('interaction-prd/NeosAI-IDP-四期需求-workspace/interaction-prd.json', root), 'utf8'))
const prdModules = manifest.modules.filter((module) => module.kind === 'prd')

test('all phase 4 PRD modules roundtrip without modifying canonical text', () => {
  for (const module of prdModules) {
    assert.ok(moduleSections[module.prd], `missing mapping: ${module.prd}`)
    const replaced = replaceSection(text, module.prd, readSection(text, module.prd))
    assert.equal(readSection(replaced, module.prd), readSection(text, module.prd))
    assert.equal((replaced.match(/^## /gm) || []).length, (text.match(/^## /gm) || []).length)
  }
})

test('module edit changes only its source fragment and records history', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prd-pages-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const canonical = path.join(dir, 'PRD.md')
  await fs.writeFile(canonical, text)
  const store = createPrdHistory({ canonical, directory: path.join(dir, 'history') })
  const key = 'prd/pages/master-standardization-config.md'
  const before = readSection(text, key)
  const after = before.replace('GET /v1/catalog 只返回枚举显示名', 'GET /v1/catalog 只返回枚举显示名（测试修改）')
  assert.notEqual(after, before)
  await store.saveSection(key, after, before)
  const saved = await fs.readFile(canonical, 'utf8')
  assert.equal(saved, text.replace('GET /v1/catalog 只返回枚举显示名', 'GET /v1/catalog 只返回枚举显示名（测试修改）'))
  assert.equal((await store.list()).entries[0].kind, 'edit')
  await assert.rejects(store.saveSection(key, after, before), /其他编辑修改/)
})
