import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TemplateBundleFiles } from './template-bundle'

export type TemplateStarterSummary = {
  starterId: string
  title: string
  documentType: string
  summary: string
  whenToUse: string[]
  avoidFor: string[]
  tags: string[]
}

export type TemplateStarterContext = {
  starter: TemplateStarterSummary & {
    files: TemplateBundleFiles
  }
  componentSource: {
    componentId: string
    documentType: string
    source: string
  }
  designBrief: string
}

type TemplateAssetMeta = TemplateStarterSummary & {
  componentId: string
}

const assetRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'template-assets')

const readAsset = (path: string) => readFileSync(join(assetRoot, path), 'utf8').trimEnd()

const readStarterFiles = (starterId: string): TemplateBundleFiles => ({
  'manifest.json': readAsset(`starters/${starterId}/manifest.json`),
  'template.typ': readAsset(`starters/${starterId}/template.typ`),
  'data.json': readAsset(`starters/${starterId}/data.json`),
  'data.schema.json': readAsset(`starters/${starterId}/data.schema.json`),
})

const TEMPLATE_ASSET_META: TemplateAssetMeta[] = [
  {
    starterId: 'receipt-basic',
    title: '58mm receipt basic',
    documentType: 'receipt',
    summary: 'Thin starter for narrow thermal receipts with business-level receipt data.',
    whenToUse: ['小票', '点单小票', '收银小票', '餐饮收据', '快餐订单', 'receipt', 'cashier ticket'],
    avoidFor: ['A4 business document', 'exam paper', 'shipping label', 'invitation'],
    tags: ['58mm', 'thermal', 'receipt', 'qr', '中文'],
    componentId: 'receipt-v1',
  },
  {
    starterId: 'shipping-label-basic',
    title: '100mm shipping label basic',
    documentType: 'shipping_label',
    summary: 'Thin starter for courier parcel labels with routing, parties, waybill barcode, and QR fields.',
    whenToUse: ['面单', '快递面单', '物流标签', 'shipping label', 'parcel label', 'waybill'],
    avoidFor: ['receipt', 'exam paper', 'invitation', 'A4 invoice'],
    tags: ['100mm', '180mm', 'barcode', 'qr', 'shipping'],
    componentId: 'shipping-label-v1',
  },
  {
    starterId: 'exam-paper-basic',
    title: 'A4 exam paper basic',
    documentType: 'exam_paper',
    summary: 'Thin starter for A4 exams, quizzes, and worksheets with sections and questions.',
    whenToUse: ['试卷', '练习题', '考试卷', 'quiz', 'exam paper', 'worksheet'],
    avoidFor: ['receipt', 'shipping label', 'invitation', 'invoice'],
    tags: ['A4', 'exam', 'worksheet', 'questions', '中文'],
    componentId: 'exam-paper-v1',
  },
  {
    starterId: 'business-document-basic',
    title: 'A4 business document basic',
    documentType: 'business_document',
    summary: 'Thin starter for invoices, quotations, statements, and other quiet A4 business documents.',
    whenToUse: ['发票', '报价单', '账单', '合同附件', 'invoice', 'quotation', 'statement'],
    avoidFor: ['receipt', 'shipping label', 'exam paper', 'invitation'],
    tags: ['A4', 'business', 'table', 'invoice', 'quotation'],
    componentId: 'business-document-v1',
  },
  {
    starterId: 'invitation-basic',
    title: 'One-page invitation basic',
    documentType: 'invitation',
    summary: 'Thin starter for centered single-page invitations and event cards.',
    whenToUse: ['请帖', '邀请函', '婚礼请帖', '活动邀请', 'invitation', 'event card', 'wedding card'],
    avoidFor: ['receipt', 'shipping label', 'exam paper', 'business document'],
    tags: ['A5', 'invitation', 'single-page', 'centered', '中文'],
    componentId: 'invitation-v1',
  },
]

export const listTemplateStarters = (): TemplateStarterSummary[] => TEMPLATE_ASSET_META.map(({
  componentId: _componentId,
  ...starter
}) => starter)

export const getStarterContext = (starterId: string): TemplateStarterContext => {
  const meta = TEMPLATE_ASSET_META.find((item) => item.starterId === starterId)
  if (!meta) {
    throw new Error(`Unknown starterId: ${starterId}`)
  }

  const { componentId, ...starter } = meta
  return {
    starter: {
      ...starter,
      files: readStarterFiles(starterId),
    },
    componentSource: {
      componentId,
      documentType: starter.documentType,
      source: readAsset(`components/${componentId}.typ`),
    },
    designBrief: readAsset(`starters/${starterId}/design.md`),
  }
}
