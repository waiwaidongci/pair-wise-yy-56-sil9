export type WeldStatus = '待检测' | '合格' | '返修中' | '待复检' | '已关闭'
export type DefectLevel = 'Ⅰ级' | 'Ⅱ级' | 'Ⅲ级' | 'Ⅳ级'

/** 焊接方法 */
export type WeldingMethod = 'GMAW' | 'SMAW' | 'FCAW' | 'SAW' | 'GTAW'
/** 材料组别（按母材类别分组） */
export type MaterialGroup = 'Fe-1' | 'Fe-3' | 'Fe-4' | 'Fe-8'
/** 焊接位置 */
export type WeldingPosition = '平焊' | '横焊' | '立焊' | '仰焊'

export interface Defect {
  id: string
  position: number
  type: string
  length: number
  level: DefectLevel
  method: string
  report: string
}

export interface Weld {
  id: string
  drawing: string
  component: string
  joint: string
  method: string
  welder: string
  qualification: string
  qualificationValid: boolean
  inspectionRatio: number
  requiredRatio: number
  status: WeldStatus
  x: number
  y: number
  repairs: number
  defects: Defect[]
  /** 工艺卡号；旧焊缝可能缺失，缺失时进入“待补录” */
  processCardNo?: string
  /** 作业日（焊缝施焊日期），用于按当日生效的工艺卡版本取依据 */
  workDate?: string
}

export interface InspectionPlan {
  id: string
  date: string
  method: string
  weldIds: string[]
  inspector: string
  state: '待执行' | '执行中' | '已完成'
  /** 签字批次保留的当时依据（每道焊缝的工艺卡版本 + 覆盖证书快照） */
  basis?: ScopeBasis[]
  /** 是否已签字锁定；签字后工艺卡更新也不重算其依据 */
  signed?: boolean
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}

/** 焊工证书：一证覆盖一组方法 / 材料组别 / 位置 */
export interface WelderCertificate {
  /** 证书号（业务主键，重试与冲突都按它归并） */
  id: string
  welder: string
  methods: WeldingMethod[]
  materialGroups: MaterialGroup[]
  positions: WeldingPosition[]
  issueDate: string
  expiryDate: string
  /** 录入端标识，用于“两个录入端同时提交同一证书”的先到生效 / 后到留冲突 */
  terminal?: string
  submittedAt?: string
}

/** 工艺卡（WPS）：按版本生效，作业日取当日生效版本 */
export interface ProcessCard {
  id: string
  version: number
  method: WeldingMethod
  materialGroup: MaterialGroup
  position: WeldingPosition
  /** 生效日期（含） */
  effectiveFrom: string
  /** 失效日期（含）；为空表示当前版本 */
  effectiveTo?: string
}

/** 两个录入端提交同一证书时，先到生效、后到留冲突 */
export interface CertificateConflict {
  id: string
  certificateNo: string
  welder: string
  winnerTerminal: string
  loserTerminal: string
  winnerSubmittedAt: string
  loserSubmittedAt: string
  detail: string
}

/** 保存失败后按证书号重试续办的登记项 */
export interface FailedSave {
  certificateNo: string
  welder: string
  terminal: string
  reason: string
  failedAt: string
  retryCount: number
  /** 待保存的证书内容，重试时按证书号续办入库 */
  certificate: WelderCertificate
}

export type ScopeStatus = '可排' | '无覆盖' | '待补录'

/** 每道焊缝的范围账结果 */
export interface ScopeLedgerEntry {
  weldId: string
  welder: string
  workDate: string
  processCardNo?: string
  processCardVersion?: number
  method?: WeldingMethod
  materialGroup?: MaterialGroup
  position?: WeldingPosition
  status: ScopeStatus
  /** 选中的覆盖证书（多证可覆盖时取最早到期） */
  certificateNo?: string
  certificateExpiry?: string
  /** 与选中证书范围重叠的其它证书号 */
  overlapCertificateNos?: string[]
  reason?: string
}

/** 检测计划中每道焊缝的当时依据快照 */
export interface ScopeBasis {
  weldId: string
  processCardNo: string
  processCardVersion: number
  method: WeldingMethod
  materialGroup: MaterialGroup
  position: WeldingPosition
  certificateNo: string
  certificateExpiry: string
}
