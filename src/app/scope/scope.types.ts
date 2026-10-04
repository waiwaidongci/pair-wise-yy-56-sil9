// 范围账领域模型：焊工资质（证书）× 焊接工艺卡（WPS）× 焊缝 × 检测计划
// 现场排检必须同时核对工艺卡上的“焊接方法、材料组别、焊接位置”三项，不再只看焊工姓名。

/** 焊接位置（ISO 6947 / NB/T 证书常用代号） */
export type WeldPosition = 'PA' | 'PB' | 'PC' | 'PD' | 'PE' | 'PF' | 'PG' | 'PH'

/** 工艺卡（WPS）。同一卡号可有多版，按焊缝作业日取当时已生效的最新版本。 */
export interface WpsCard {
  /** 工艺卡号，如 WPS-017；旧焊缝可能没有卡号 */
  cardNo: string
  version: number
  /** 焊接方法，如 GMAW / SMAW / SAW / FCAW */
  method: string
  /** 材料组别，如 Fe-I / Fe-II / Fe-III */
  materialGroup: string
  /** 焊接位置代号 */
  position: string
  /** 该版本生效日（YYYY-MM-DD），按作业日比较 */
  effectiveFrom: string
  remark?: string
}

/** 待排焊缝。方法/材料/位置不直接挂在焊缝上，而是作业日当天去工艺卡里取。 */
export interface ScopeWeld {
  id: string
  drawing: string
  component: string
  /** 作业日（YYYY-MM-DD），决定取哪版工艺卡、证书是否在有效期内 */
  workDate: string
  /** 现场只认焊工姓名 */
  welder: string
  /** 关联工艺卡号；旧焊缝没有卡号时为 null，先待补录 */
  wpsCardNo: string | null
}

/** 焊工资格证书。三项范围是集合，全部命中才算覆盖。 */
export interface WelderCertificate {
  id: string
  certificateNo: string
  welder: string
  methods: string[]
  materialGroups: string[]
  positions: string[]
  validFrom: string
  validUntil: string
  /** 录入终端，模拟两个录入端同时提交 */
  terminal: '录入端A' | '录入端B'
  /** 生效：可参与覆盖核对；冲突：同证书号后到；待重试：保存失败等待按证书号续办 */
  status: '生效' | '冲突' | '待重试'
  submittedAt: number
  conflictWith?: string
  saveError?: string
}

/** 从工艺卡取得的三项范围 */
export interface ScopeTriple {
  method: string
  materialGroup: string
  position: string
}

/** 计划行落账时冻结的“当时依据”。签字批次即使后续工艺卡更新也保留这份快照。 */
export interface BasisSnapshot extends ScopeTriple {
  welder: string
  workDate: string
  wpsCardNo: string
  wpsVersion: number
  certificateId: string
  certificateNo: string
  certValidUntil: string
}

export type PlanLineState = '待执行' | '已签字' | '已执行' | '已退回重算'

/** 检测计划行：一道可覆盖焊缝对应一行，依据随落账快照保存 */
export interface PlanLine {
  id: string
  weldId: string
  state: PlanLineState
  basis: BasisSnapshot
  batchNo?: string
  signedAt?: string
  returnReason?: string
  createdAt: number
}

export type CoverageStage = '待补录工艺卡' | '资质不覆盖' | '可排入'

/** 三项缺失情况 + 三项都覆盖但证书已过期的清单 */
export interface CoverageGap {
  methodMissing: boolean
  materialGroupMissing: boolean
  positionMissing: boolean
  /** 三项都覆盖、但作业日已不在有效期内的证书 */
  expiredCoverers: Array<{ certificateId: string; certificateNo: string; validUntil: string }>
}

/** 单道焊缝的范围账核对结论 */
export interface CoverageResult {
  weldId: string
  welder: string
  workDate: string
  wpsCardNo: string | null
  stage: CoverageStage
  /** 待补录 / 无有效版本等阻塞说明 */
  reason?: string
  triple?: ScopeTriple & { wpsVersion: number }
  /** 按最早到期选中的证书（可排入时有值） */
  chosen?: {
    certificateId: string
    certificateNo: string
    validUntil: string
  }
  /** 所有三项全覆盖的证书，已按到期日升序，含选中项 */
  overlaps: Array<{ certificateId: string; certificateNo: string; validUntil: string }>
  gap?: CoverageGap
}

export interface ScopeAuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}
