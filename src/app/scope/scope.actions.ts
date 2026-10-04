import { createAction, props } from '@ngrx/store'
import type { PlanLine, ScopeAuditEvent, ScopeWeld, WelderCertificate, WpsCard } from './scope.types'

/** 范围账：按当前工艺卡/证书/焊缝重算核对结论（在组件选择器里派生，此动作用于落审计） */

/** 排检测计划：可覆盖焊缝落账，已在计划中的不重复排 */
export const schedulePlans = createAction(
  '[Scope] Schedule Plans',
  props<{ scheduled: string[]; skipped: Array<{ weldId: string; reason: string }>; lines: PlanLine[] }>(),
)

/** 批次签字 */
export const signBatch = createAction(
  '[Scope] Sign Batch',
  props<{ weldIds: string[]; batchNo: string; signedAt: string; lines: PlanLine[] }>(),
)

/** 发布工艺卡新版本，并退回受影响的待执行计划 */
export const publishWps = createAction(
  '[Scope] Publish WPS Version',
  props<{ card: WpsCard; lines: PlanLine[] }>(),
)

/** 证书录入（含两录入端同证书号冲突、保存失败待重试） */
export const admitCertificate = createAction(
  '[Scope] Admit Certificate',
  props<{ certs: WelderCertificate[]; result: string; certificateNo: string; detail: string }>(),
)

/** 证书台账直接编辑（演示用：维护证书/焊缝主数据） */
export const replaceCerts = createAction('[Scope] Replace Certs', props<{ certs: WelderCertificate[] }>())
export const replaceWelds = createAction('[Scope] Replace Welds', props<{ welds: ScopeWeld[] }>())
export const replaceCards = createAction('[Scope] Replace WPS Cards', props<{ cards: WpsCard[] }>())

export const pushScopeAudit = createAction('[Scope] Push Audit', props<{ event: ScopeAuditEvent }>())
