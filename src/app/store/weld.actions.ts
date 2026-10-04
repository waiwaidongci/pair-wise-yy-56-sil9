import { createAction, props } from '@ngrx/store'
import type {
  CertificateConflict,
  FailedSave,
  InspectionPlan,
  ProcessCard,
  WelderCertificate,
  Weld,
  WeldStatus,
} from '../types'

export const loadWelds = createAction('[Weld] Load')
export const loadWeldsSuccess = createAction('[Weld API] Load Success', props<{ welds: Weld[]; plans: InspectionPlan[] }>())
export const loadScopeSuccess = createAction(
  '[Scope API] Load Success',
  props<{ certificates: WelderCertificate[]; processCards: ProcessCard[]; conflicts: CertificateConflict[]; failedSaves: FailedSave[] }>(),
)

export const selectWeld = createAction('[Weld] Select', props<{ id: string }>())
export const filterStatus = createAction('[Weld] Filter Status', props<{ status: string }>())
export const advanceWeld = createAction('[Weld] Advance', props<{ id: string; status: WeldStatus }>())
export const createPlan = createAction('[Inspection] Create Plan', props<{ plan: InspectionPlan }>())
export const lockBaseline = createAction('[Approval] Lock Baseline')

/** 工艺卡更新：未执行计划退回重算，已签字批次留当时依据 */
export const updateProcessCard = createAction('[Scope] Update Process Card', props<{ card: ProcessCard }>())
export const recalcPlans = createAction('[Scope] Recalc Plans')

/** 两个录入端同时提交同一证书：先到生效，后到留冲突 */
export const submitCertificate = createAction('[Scope] Submit Certificate', props<{ certificate: WelderCertificate }>())
export const submitCertificateConflict = createAction('[Scope] Submit Certificate Conflict', props<{ conflict: CertificateConflict }>())

/** 保存失败后按证书号重试续办，不重复排计划 */
export const retryCertificate = createAction('[Scope] Retry Certificate', props<{ certificateNo: string }>())

/** 旧焊缝补录工艺卡号 */
export const supplementProcessCard = createAction('[Scope] Supplement Process Card', props<{ weldId: string; processCardNo: string }>())
