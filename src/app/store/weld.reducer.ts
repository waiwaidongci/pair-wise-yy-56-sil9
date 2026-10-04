import { createReducer, on } from '@ngrx/store'
import type { AuditEvent, CertificateConflict, FailedSave, InspectionPlan, ProcessCard, ScopeLedgerEntry, WelderCertificate, Weld } from '../types'
import { ScopeEngine } from '../services/scope-engine.service'
import { AS_OF } from '../mock-data'
import * as A from './weld.actions'

const engine = new ScopeEngine()

export interface WeldState {
  welds: Weld[]
  plans: InspectionPlan[]
  certificates: WelderCertificate[]
  processCards: ProcessCard[]
  conflicts: CertificateConflict[]
  failedSaves: FailedSave[]
  ledger: ScopeLedgerEntry[]
  selectedId: string
  statusFilter: string
  locked: boolean
  version: number
  audit: AuditEvent[]
}

const audit: AuditEvent[] = [
  { id: 'AE-1', time: '16:38', actor: '赵岚', action: '提交复检', target: 'W-104', detail: '返修后 UT 复检合格，等待审核签字' },
  { id: 'AE-2', time: '15:12', actor: '陈锋', action: '录入缺陷', target: 'W-107', detail: '翼缘板端部夹渣，长度 12mm，Ⅱ级' },
  { id: 'AE-3', time: '14:20', actor: '系统', action: '资质预警', target: 'W-109', detail: '焊工证书 2026-10-01 到期，不得列入后续检测计划' },
]

export const initialState: WeldState = {
  welds: [], plans: [], certificates: [], processCards: [], conflicts: [], failedSaves: [], ledger: [],
  selectedId: '', statusFilter: '全部', locked: false, version: 12, audit,
}

const now = () => new Date().toLocaleString('zh-CN', { hour12: false })

/** 依据当前焊缝 / 证书 / 工艺卡重算范围账，并同步焊缝资质可用标记 */
function withLedger(state: WeldState): WeldState {
  const ledger = engine.buildLedger(state.welds, state.processCards, state.certificates, AS_OF)
  const welds = state.welds.map((w) => {
    const entry = ledger.find((e) => e.weldId === w.id)
    return entry ? { ...w, qualificationValid: entry.status === '可排' } : w
  })
  return { ...state, welds, ledger }
}

function auditEntry(actor: string, action: string, target: string, detail: string): AuditEvent {
  return { id: `AE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: now(), actor, action, target, detail }
}

export const weldReducer = createReducer(
  initialState,

  on(A.loadWeldsSuccess, (state, { welds, plans }) =>
    withLedger({ ...state, welds, plans, selectedId: state.selectedId || welds[0]?.id || '' })),

  on(A.loadScopeSuccess, (state, { certificates, processCards, conflicts, failedSaves }) =>
    withLedger({ ...state, certificates, processCards, conflicts, failedSaves })),

  on(A.selectWeld, (state, { id }) => ({ ...state, selectedId: id })),
  on(A.filterStatus, (state, { status }) => ({ ...state, statusFilter: status })),

  on(A.advanceWeld, (state, { id, status }) => ({
    ...state,
    version: state.version + 1,
    welds: state.welds.map((weld) => weld.id === id ? { ...weld, status } : weld),
    audit: [auditEntry('当前审核人', '状态流转', id, `状态变更为 ${status}`), ...state.audit],
  })),

  on(A.createPlan, (state, { plan }) => {
    const basis = plan.weldIds
      .map((id) => state.ledger.find((e) => e.weldId === id))
      .map((e) => (e ? engine.basisOf(e) : undefined))
      .filter((b): b is NonNullable<typeof b> => !!b)
    const newPlan: InspectionPlan = { ...plan, basis: basis.length ? basis : plan.basis }
    return { ...state, plans: [newPlan, ...state.plans], version: state.version + 1 }
  }),

  on(A.lockBaseline, (state) => ({
    ...state,
    locked: true,
    plans: state.plans.map((p) => p.state === '已完成' ? { ...p, signed: true } : p),
    audit: [auditEntry('质量负责人', '签字锁定', '检测批次', '焊工资质、检测比例与返修闭环已确认'), ...state.audit],
  })),

  // —— 范围账：工艺卡更新，未执行计划退回重算，已签字批次留当时依据 ——
  on(A.updateProcessCard, (state, { card }) => {
    const processCards = [...state.processCards.filter((c) => !(c.id === card.id && c.version === card.version)), card]
    const recomputed = withLedger({ ...state, processCards })
    const { plans, recalculated } = engine.recalcPlans(recomputed.plans, recomputed.ledger)
    const audit: AuditEvent[] = [
      auditEntry('工艺工程师', '工艺卡更新', card.id, `工艺卡 ${card.id} 升级至 v${card.version}（${card.method} / ${card.materialGroup} / ${card.position}，${card.effectiveFrom} 起生效）`),
    ]
    if (recalculated.length) {
      audit.push(auditEntry('系统', '计划重算', recalculated.join('、'), `未执行计划 ${recalculated.join('、')} 已按新依据重算；已签字批次仍留当时依据`))
    }
    return { ...recomputed, plans, version: recomputed.version + 1, audit: [...audit, ...recomputed.audit] }
  }),

  on(A.recalcPlans, (state) => {
    const recomputed = withLedger(state)
    const { plans, recalculated } = engine.recalcPlans(recomputed.plans, recomputed.ledger)
    const audit = recalculated.length
      ? [auditEntry('系统', '计划重算', recalculated.join('、'), `未执行计划已按最新工艺卡重算，已签字批次保留原依据`), ...state.audit]
      : state.audit
    return { ...recomputed, plans, audit }
  }),

  // —— 两个录入端同时提交同一证书：先到生效，后到留冲突 ——
  on(A.submitCertificate, (state, { certificate }) => {
    const existing = state.certificates.find((c) => c.id === certificate.id)
    if (existing) {
      if (existing.terminal === certificate.terminal) return state // 同端重复提交，幂等不生效
      const conflict: CertificateConflict = {
        id: `CF-${Date.now()}`,
        certificateNo: certificate.id,
        welder: certificate.welder,
        winnerTerminal: existing.terminal ?? '先到端',
        loserTerminal: certificate.terminal ?? '后到端',
        winnerSubmittedAt: existing.submittedAt ?? '',
        loserSubmittedAt: certificate.submittedAt ?? now(),
        detail: `证书 ${certificate.id} 由「${existing.terminal}」先到生效，「${certificate.terminal}」后到提交已记录冲突`,
      }
      return {
        ...state,
        conflicts: [conflict, ...state.conflicts],
        audit: [auditEntry(certificate.terminal ?? '后到端', '证书提交冲突', certificate.id, conflict.detail), ...state.audit],
      }
    }
    const certificates = [{ ...certificate, submittedAt: certificate.submittedAt ?? now() }, ...state.certificates]
    const recomputed = withLedger({ ...state, certificates })
    return {
      ...recomputed,
      audit: [auditEntry(certificate.terminal ?? '录入端', '证书录入生效', certificate.id, `证书 ${certificate.id}（${certificate.welder}）先到生效，覆盖 ${certificate.methods.join('/')} / ${certificate.materialGroups.join('/')} / ${certificate.positions.join('/')}`), ...recomputed.audit],
    }
  }),

  // —— 保存失败后按证书号重试续办，不重复排计划 ——
  on(A.retryCertificate, (state, { certificateNo }) => {
    const failed = state.failedSaves.find((f) => f.certificateNo === certificateNo)
    if (!failed) return state
    let certificates = state.certificates
    if (!certificates.some((c) => c.id === certificateNo)) {
      certificates = [{ ...failed.certificate, submittedAt: now() }, ...certificates]
    }
    const recomputed = withLedger({
      ...state,
      certificates,
      failedSaves: state.failedSaves.filter((f) => f.certificateNo !== certificateNo),
    })
    return {
      ...recomputed,
      audit: [auditEntry(failed.terminal, '重试续办', certificateNo, `按证书号 ${certificateNo} 重试保存成功；计划按证书号归并，未重复排计划`), ...recomputed.audit],
    }
  }),

  // —— 旧焊缝补录工艺卡号 ——
  on(A.supplementProcessCard, (state, { weldId, processCardNo }) => {
    const welds = state.welds.map((w) => w.id === weldId ? { ...w, processCardNo } : w)
    const recomputed = withLedger({ ...state, welds })
    const { plans, recalculated } = engine.recalcPlans(recomputed.plans, recomputed.ledger)
    const audit = [
      auditEntry('工艺工程师', '补录工艺卡号', weldId, `焊缝 ${weldId} 补录工艺卡 ${processCardNo}，已纳入范围账重算`),
      ...(recalculated.length ? [auditEntry('系统', '计划重算', recalculated.join('、'), `补录后未执行计划 ${recalculated.join('、')} 已重算`)] : []),
      ...recomputed.audit,
    ]
    return { ...recomputed, plans, audit }
  }),
)
