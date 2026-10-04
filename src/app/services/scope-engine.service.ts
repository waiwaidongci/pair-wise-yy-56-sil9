import { Injectable } from '@angular/core'
import type {
  InspectionPlan,
  MaterialGroup,
  ProcessCard,
  ScopeBasis,
  ScopeLedgerEntry,
  WelderCertificate,
  WeldingMethod,
  WeldingPosition,
  Weld,
} from '../types'

/**
 * 范围账引擎：把焊工证书、工艺卡、焊缝、检测计划接成一本账。
 * 全部为纯函数，便于在 reducer 中直接调用。
 */
@Injectable({ providedIn: 'root' })
export class ScopeEngine {
  /** 按作业日取工艺卡：取作业日（含）之前生效、版本号最大的一版 */
  resolveProcessCard(cards: ProcessCard[], cardNo: string | undefined, workDate: string): ProcessCard | undefined {
    if (!cardNo || !workDate) return undefined
    const inRange = cards
      .filter((c) => c.id === cardNo && c.effectiveFrom <= workDate && (!c.effectiveTo || c.effectiveTo >= workDate))
      .sort((a, b) => b.version - a.version)
    if (inRange.length) return inRange[0]
    // 作业日晚于所有版本生效日时，退回最近一版（旧焊缝补录场景）
    return cards
      .filter((c) => c.id === cardNo && c.effectiveFrom <= workDate)
      .sort((a, b) => b.version - a.version)[0]
  }

  /** 证书覆盖方法 / 材料组别 / 位置 三项，且在作业日当天有效 */
  covers(
    cert: WelderCertificate,
    method: WeldingMethod,
    materialGroup: MaterialGroup,
    position: WeldingPosition,
    onDate: string,
  ): boolean {
    return (
      cert.methods.includes(method) &&
      cert.materialGroups.includes(materialGroup) &&
      cert.positions.includes(position) &&
      (!cert.issueDate || cert.issueDate <= onDate) &&
      (!cert.expiryDate || cert.expiryDate >= onDate)
    )
  }

  /** 取某焊工覆盖三项的证书，按最早到期排序（先到期的先排） */
  findCovering(
    certs: WelderCertificate[],
    welder: string,
    method: WeldingMethod,
    materialGroup: MaterialGroup,
    position: WeldingPosition,
    onDate: string,
  ): WelderCertificate[] {
    return certs
      .filter((c) => c.welder === welder && this.covers(c, method, materialGroup, position, onDate))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  }

  /** 证书是否已过期（相对于统计基准日） */
  isExpired(cert: WelderCertificate | undefined, asOf: string): boolean {
    return !!cert && !!cert.expiryDate && cert.expiryDate < asOf
  }

  /** 生成单道焊缝的范围账条目 */
  entryFor(weld: Weld, cards: ProcessCard[], certs: WelderCertificate[], asOf: string): ScopeLedgerEntry {
    const base: ScopeLedgerEntry = {
      weldId: weld.id,
      welder: weld.welder,
      workDate: weld.workDate ?? '',
      status: '待补录',
    }
    if (!weld.processCardNo) {
      return { ...base, reason: '旧焊缝无工艺卡号，待补录工艺卡后再排' }
    }
    if (!weld.workDate) {
      return { ...base, processCardNo: weld.processCardNo, reason: '焊缝无作业日，无法取当日工艺卡版本，待补录' }
    }
    const card = this.resolveProcessCard(cards, weld.processCardNo, weld.workDate)
    if (!card) {
      return { ...base, processCardNo: weld.processCardNo, reason: `工艺卡 ${weld.processCardNo} 在作业日无生效版本` }
    }
    const withCard: ScopeLedgerEntry = {
      ...base,
      processCardNo: card.id,
      processCardVersion: card.version,
      method: card.method,
      materialGroup: card.materialGroup,
      position: card.position,
    }
    const covering = this.findCovering(certs, weld.welder, card.method, card.materialGroup, card.position, weld.workDate)
    if (!covering.length) {
      const owned = certs.filter((c) => c.welder === weld.welder)
      const missing: string[] = []
      if (!owned.some((c) => c.methods.includes(card.method))) missing.push(`方法 ${card.method}`)
      if (!owned.some((c) => c.materialGroups.includes(card.materialGroup))) missing.push(`材料组别 ${card.materialGroup}`)
      if (!owned.some((c) => c.positions.includes(card.position))) missing.push(`位置 ${card.position}`)
      const expired = owned.some((c) => c.expiryDate < asOf)
      return {
        ...withCard,
        status: '无覆盖',
        reason: expired && !missing.length
          ? '覆盖范围的证书均已过期，不得排入'
          : `无证书覆盖：${missing.join('、') || '证书已过期'}`,
      }
    }
    const chosen = covering[0]
    const overlaps = covering.slice(1).map((c) => c.id)
    return {
      ...withCard,
      status: '可排',
      certificateNo: chosen.id,
      certificateExpiry: chosen.expiryDate,
      overlapCertificateNos: overlaps.length ? overlaps : undefined,
      reason: this.isExpired(chosen, asOf) ? '覆盖证书已过期，不得排入' : undefined,
    }
  }

  /** 生成范围账 */
  buildLedger(welds: Weld[], cards: ProcessCard[], certs: WelderCertificate[], asOf: string): ScopeLedgerEntry[] {
    return welds.map((w) => this.entryFor(w, cards, certs, asOf))
  }

  /** 由台账条目生成检测依据快照 */
  basisOf(entry: ScopeLedgerEntry): ScopeBasis | undefined {
    if (
      entry.status !== '可排' ||
      !entry.processCardNo ||
      entry.processCardVersion == null ||
      !entry.method ||
      !entry.materialGroup ||
      !entry.position ||
      !entry.certificateNo ||
      !entry.certificateExpiry
    ) {
      return undefined
    }
    return {
      weldId: entry.weldId,
      processCardNo: entry.processCardNo,
      processCardVersion: entry.processCardVersion,
      method: entry.method,
      materialGroup: entry.materialGroup,
      position: entry.position,
      certificateNo: entry.certificateNo,
      certificateExpiry: entry.certificateExpiry,
    }
  }

  /**
   * 工艺卡更新后重算未执行计划：
   * - 已签字（已完成 / signed）批次保留当时依据，不动；
   * - 未执行（待执行）计划按新台账重算依据，剔除已不可排的焊缝。
   * 返回新计划列表与被重算的计划号。
   */
  recalcPlans(
    plans: InspectionPlan[],
    ledger: ScopeLedgerEntry[],
  ): { plans: InspectionPlan[]; recalculated: string[] } {
    const basisByWeld = new Map<string, ScopeBasis>()
    for (const entry of ledger) {
      const b = this.basisOf(entry)
      if (b) basisByWeld.set(entry.weldId, b)
    }
    const recalculated: string[] = []
    const next = plans.map((p) => {
      if (p.signed || p.state === '已完成') return p
      if (p.state !== '待执行') return p
      const newBasis = p.weldIds.map((id) => basisByWeld.get(id)).filter((b): b is ScopeBasis => !!b)
      const newWeldIds = newBasis.map((b) => b.weldId)
      const changed = JSON.stringify(newBasis) !== JSON.stringify(p.basis ?? [])
      if (changed) recalculated.push(p.id)
      return { ...p, weldIds: newWeldIds, basis: newBasis }
    })
    return { plans: next, recalculated }
  }
}
