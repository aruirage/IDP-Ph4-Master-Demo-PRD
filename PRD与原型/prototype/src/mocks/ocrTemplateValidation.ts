import { t } from '@/i18n/translate'
import type { OcrModelTemplate } from './phase3'

export const OCR_TEMPLATE_MAX_COUNT = 20

export interface TemplateValidationDocType {
  id: string
  name: string
}

export function templateValidation(
  rows: OcrModelTemplate[],
  fallback: string | undefined,
  docTypes: TemplateValidationDocType[]
): string | undefined {
  const fallbackRow = rows.find((row) => row.id === fallback)
  if (!fallbackRow) {
    return t('phase3.templateFallbackMainRequired')
  }

  const customRows = rows.filter((row) => row.id !== fallback)
  if (customRows.length > OCR_TEMPLATE_MAX_COUNT) {
    return t('phase3.templateLimitExceeded', { max: OCR_TEMPLATE_MAX_COUNT })
  }

  const docTypeNames = new Map(docTypes.map((docType) => [docType.id, docType.name]))
  const names = new Set<string>()
  const combinations = new Set<string>()

  function validateRow(row: OcrModelTemplate, requireFields: boolean): string | undefined {
    const isFallback = row.id === fallback
    const verify = row.verify ?? []

    if (!isFallback && !row.name.trim()) {
      return t('phase3.templateRowNameRequired')
    }
    if (!row.main) {
      return t(
        isFallback ? 'phase3.templateFallbackMainRequired' : 'phase3.templateRowMainRequired'
      )
    }
    if (requireFields && !row.docTypes.length) {
      return t('phase3.templateRowDocTypesRequired')
    }
    if (requireFields) {
      const seen = new Set<string>()
      for (const id of row.docTypes) {
        if (!docTypeNames.has(id)) {
          return t('phase3.templateInvalidDocType', { docType: docTypeNames.get(id) ?? id })
        }
        if (seen.has(id)) {
          return t('phase3.templateDocTypeDuplicate', { docType: docTypeNames.get(id) ?? id })
        }
        seen.add(id)
      }
    }

    const normalizedName = row.name.trim()
      ? row.name.trim().normalize('NFKC').toLocaleLowerCase()
      : ''
    if (normalizedName && names.has(normalizedName)) {
      return t('phase3.templateDuplicateName', { name: row.name.trim() })
    }
    const combination = JSON.stringify([row.main, [...verify].sort()])
    if (combinations.has(combination)) {
      return t('phase3.templateDuplicateModels')
    }

    if (normalizedName) names.add(normalizedName)
    combinations.add(combination)
    return undefined
  }

  const fallbackError = validateRow(fallbackRow, false)
  if (fallbackError) return fallbackError

  for (const row of customRows) {
    const error = validateRow(row, true)
    if (error) return error
  }
  return undefined
}
