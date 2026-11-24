export function reviewManifest(base) {
  const pages = base.pages.filter((page) => page.kind === 'page')
  const pageIds = new Set(pages.map((page) => page.id))
  const titles = [
    '本期范围与优先级',
    '用户故事与旅程',
    '术语、数据结构与状态',
    'API 契约',
    '功能详情',
    '异常、注意点与附件'
  ]
  const functionPageIds = ['api-settings', 'master-standardization-config', 'business-scene', 'ocr-confirmation'].filter((id) => pageIds.has(id))
  const modules = titles.map((title, index) => {
    const number = String(index + 1).padStart(2, '0')
    return {
      id: `chapter-${number}`,
      title: `第${index + 1}章｜${title}`,
      prd: `prd/chapter-${number}.md`,
      kind: 'prd',
      pages: number === '05' ? functionPageIds : [],
      status: 'draft'
    }
  })
  return {
    ...base,
    modules,
    pages: pages.map((page) => ({
      ...page,
      moduleId: functionPageIds.includes(page.id) ? 'chapter-05' : page.moduleId
    })),
    relations: base.relations.filter((relation) => pageIds.has(relation.from) && pageIds.has(relation.to))
  }
}
