import { createReducer, on } from '@ngrx/store'
import { resolveLedger } from './scope.engine'
import { seedAudit, seedCerts, seedPlanLines, seedWelds, seedWpsCards } from './scope.seed'
import type { CoverageResult, PlanLine, ScopeAuditEvent, ScopeWeld, WelderCertificate, WpsCard } from './scope.types'
import * as A from './scope.actions'

export interface ScopeState {
  welds: ScopeWeld[]
  cards: WpsCard[]
  certs: WelderCertificate[]
  planLines: PlanLine[]
  audit: ScopeAuditEvent[]
  /** 最近一次操作的提示（冲突/跳过/续办等），供页面横幅展示 */
  lastNotice: string
}

export const scopeInitialState: ScopeState = {
  welds: seedWelds,
  cards: seedWpsCards,
  certs: seedCerts,
  planLines: seedPlanLines,
  audit: seedAudit,
  lastNotice: '',
}

const nowText = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const withAudit = (state: ScopeState, event: Omit<ScopeAuditEvent, 'id' | 'time'>): ScopeState => ({
  ...state,
  audit: [{ ...event, id: `SA-${Date.now()}-${Math.floor(Math.random() * 1000)}`, time: nowText() }, ...state.audit],
})

export const scopeReducer = createReducer(
  scopeInitialState,

  on(A.schedulePlans, (state, { lines, scheduled, skipped }) => {
    let next = withAudit({ ...state, planLines: lines }, {
      actor: '计划员',
      action: '排入检测计划',
      target: scheduled.length ? scheduled.join('、') : '无新增',
      detail: scheduled.length
        ? `按当时工艺卡+最早到期证书落账 ${scheduled.length} 道，已在计划中的不重复排；跳过 ${skipped.length} 道`
        : `无新增可排焊缝（不重复排计划）；跳过/阻塞 ${skipped.length} 道`,
    })
    if (skipped.length) {
      next = withAudit(next, {
        actor: '系统',
        action: '排检拦截',
        target: skipped.map((s) => s.weldId).join('、'),
        detail: skipped.map((s) => `${s.weldId}：${s.reason}`).join('；'),
      })
    }
    return { ...next, lastNotice: scheduled.length ? `已排入 ${scheduled.length} 道，跳过 ${skipped.length} 道` : '无新增：可排焊缝均已在计划中' }
  }),

  on(A.signBatch, (state, { weldIds, batchNo, signedAt, lines }) =>
    withAudit({ ...state, planLines: lines, lastNotice: `批次 ${batchNo} 已签字，依据快照冻结` }, {
      actor: '质量负责人',
      action: '批次签字',
      target: batchNo,
      detail: `${weldIds.join('、')} 共 ${weldIds.length} 道签字锁定；后续工艺卡更新不改动本批依据（${signedAt}）`,
    }),
  ),

  on(A.publishWps, (state, { card, lines }) => {
    const returned = lines.filter(
      (l) => l.state === '已退回重算' && l.basis.wpsCardNo === card.cardNo,
    ).length
    const kept = state.planLines.filter(
      (l) => l.state === '已签字' && l.basis.wpsCardNo === card.cardNo,
    ).length
    return withAudit({ ...state, cards: [...state.cards, card], planLines: lines, lastNotice: `WPS ${card.cardNo} v${card.version} 已发布：退回 ${returned} 道待执行计划，已签字 ${kept} 道保留当时依据` }, {
      actor: '工艺工程师',
      action: '工艺卡更新',
      target: `${card.cardNo} v${card.version}`,
      detail: `位置/方法/材料变更为 ${card.method}·${card.materialGroup}·${card.position}，${card.effectiveFrom} 生效；退回待执行计划 ${returned} 道重算，已签字 ${kept} 道保留快照`,
    })
  }),

  on(A.admitCertificate, (state, { certs, result, certificateNo, detail }) =>
    withAudit({ ...state, certs, lastNotice: detail }, {
      actor: '录入端',
      action:
        result === '生效' ? '证书录入生效'
        : result === '续办生效' ? '证书重试续办'
        : result === '冲突' ? '证书冲突挂起'
        : '证书保存失败',
      target: certificateNo,
      detail,
    }),
  ),

  on(A.replaceCerts, (state, { certs }) => ({ ...state, certs })),
  on(A.replaceWelds, (state, { welds }) => ({ ...state, welds })),
  on(A.replaceCards, (state, { cards }) => ({ ...state, cards })),
)

/** 选择器：全量范围账结论（每次状态变化按纯引擎重算） */
export const selectLedger = (state: ScopeState): CoverageResult[] =>
  resolveLedger(state.welds, state.cards, state.certs)
