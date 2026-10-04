// 范围账规则引擎（纯函数，无框架依赖，可直接用 Node 单测）
// 规则来源：
//  1. 每道焊缝按作业日取工艺卡的 方法/材料组别/位置；旧焊缝无卡号 → 待补录。
//  2. 证书三项（方法、材料组别、位置）全部覆盖，且作业日在有效期内，才可排入。
//  3. 多份证书都覆盖时，选最早到期；同时列出重叠覆盖范围。
//  4. 工艺卡更新后，未执行（待执行）计划退回重算；已签字/已执行批次保留当时依据。
//  5. 两录入端同证书号：先到生效、后到留冲突。
//  6. 保存失败按证书号重试续办，幂等：同号已生效不重复落账、不重复排计划。

import type {
  BasisSnapshot,
  CoverageResult,
  PlanLine,
  ScopeWeld,
  WelderCertificate,
  WpsCard,
} from './scope.types'

/** YYYY-MM-DD 字符串可直接比较大小 */
export const dateOnOrBefore = (date: string, boundary: string) => date <= boundary

/** 按作业日取当时已生效的工艺卡最新版本；无卡号或当时无已生效版本返回 null */
export function effectiveWps(weld: ScopeWeld, cards: WpsCard[]): WpsCard | null {
  if (!weld.wpsCardNo) return null
  return cards
    .filter((card) => card.cardNo === weld.wpsCardNo && card.effectiveFrom <= weld.workDate)
    .sort((a, b) =>
      b.version - a.version || b.effectiveFrom.localeCompare(a.effectiveFrom),
    )[0] ?? null
}

export interface CertCover {
  certificateId: string
  certificateNo: string
  validUntil: string
}

/** 找出“三项全部覆盖”的证书（不看有效期），用于报告重叠与过期情况 */
export function threeWayCovers(
  welder: string,
  triple: { method: string; materialGroup: string; position: string },
  certs: WelderCertificate[],
): WelderCertificate[] {
  return certs
    .filter(
      (cert) =>
        cert.status === '生效' &&
        cert.welder === welder &&
        cert.methods.includes(triple.method) &&
        cert.materialGroups.includes(triple.materialGroup) &&
        cert.positions.includes(triple.position),
    )
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil) || a.submittedAt - b.submittedAt)
}

function toCover(cert: WelderCertificate): CertCover {
  return { certificateId: cert.id, certificateNo: cert.certificateNo, validUntil: cert.validUntil }
}

/** 单道焊缝核对：补录态优先，其次三项核对+有效期，最后给覆盖结论 */
export function resolveWeld(
  weld: ScopeWeld,
  cards: WpsCard[],
  certs: WelderCertificate[],
): CoverageResult {
  const base = { weldId: weld.id, welder: weld.welder, workDate: weld.workDate, wpsCardNo: weld.wpsCardNo }

  if (!weld.wpsCardNo) {
    return { ...base, stage: '待补录工艺卡', reason: '旧焊缝缺工艺卡号，先补录后再排范围账', overlaps: [] }
  }

  const wps = effectiveWps(weld, cards)
  if (!wps) {
    return {
      ...base,
      stage: '待补录工艺卡',
      reason: `作业日 ${weld.workDate} 时 ${weld.wpsCardNo} 尚无已生效版本`,
      overlaps: [],
    }
  }

  const triple = {
    method: wps.method,
    materialGroup: wps.materialGroup,
    position: wps.position,
    wpsVersion: wps.version,
  }

  // 三项各自的覆盖情况：只要有一项无证书命中，就记录缺项
  const methodHit = certs.some(
    (c) => c.status === '生效' && c.welder === weld.welder && c.methods.includes(wps.method),
  )
  const materialHit = certs.some(
    (c) => c.status === '生效' && c.welder === weld.welder && c.materialGroups.includes(wps.materialGroup),
  )
  const positionHit = certs.some(
    (c) => c.status === '生效' && c.welder === weld.welder && c.positions.includes(wps.position),
  )

  const allCoverCerts = threeWayCovers(weld.welder, wps, certs)
  const validCerts = allCoverCerts.filter(
    (c) => c.validFrom <= weld.workDate && c.validUntil >= weld.workDate,
  )
  const expiredCoverers = allCoverCerts
    .filter((c) => !(c.validFrom <= weld.workDate && c.validUntil >= weld.workDate))
    .map(toCover)

  if (validCerts.length === 0) {
    return {
      ...base,
      stage: '资质不覆盖',
      triple,
      overlaps: allCoverCerts.map(toCover),
      gap: {
        methodMissing: !methodHit,
        materialGroupMissing: !materialHit,
        positionMissing: !positionHit,
        expiredCoverers,
      },
      reason:
        allCoverCerts.length > 0
          ? `三项有 ${allCoverCerts.length} 份证书覆盖，但作业日均不在有效期内`
          : describeGap(!methodHit, !materialHit, !positionHit),
    }
  }

  const chosen = validCerts[0] // 已按最早到期升序
  return {
    ...base,
    stage: '可排入',
    triple,
    chosen: toCover(chosen),
    overlaps: allCoverCerts.map(toCover),
  }
}

function describeGap(method: boolean, material: boolean, position: boolean): string {
  const missing: string[] = []
  if (method) missing.push('方法')
  if (material) missing.push('材料组别')
  if (position) missing.push('位置')
  return missing.length ? `证书未覆盖：${missing.join('、')}` : '证书未覆盖'
}

/** 全量范围账 */
export function resolveLedger(
  welds: ScopeWeld[],
  cards: WpsCard[],
  certs: WelderCertificate[],
): CoverageResult[] {
  return welds.map((weld) => resolveWeld(weld, cards, certs))
}

/** 落账快照（签字后这一份永久保留，不随后续工艺卡更新而变） */
export function buildBasis(result: CoverageResult, weld: ScopeWeld, certs: WelderCertificate[]): BasisSnapshot | null {
  if (result.stage !== '可排入' || !result.triple || !result.chosen) return null
  const cert = certs.find((c) => c.id === result.chosen!.certificateId)
  if (!cert) return null
  return {
    welder: weld.welder,
    workDate: weld.workDate,
    wpsCardNo: weld.wpsCardNo!,
    wpsVersion: result.triple.wpsVersion,
    method: result.triple.method,
    materialGroup: result.triple.materialGroup,
    position: result.triple.position,
    certificateId: cert.id,
    certificateNo: cert.certificateNo,
    certValidUntil: cert.validUntil,
  }
}

export interface ScheduleOutcome {
  lines: PlanLine[]
  /** 本次新排入的焊缝；已存在（未退回）计划的焊缝不重复排 */
  scheduled: string[]
  /** 因不可覆盖/待补录跳过的焊缝及原因 */
  skipped: Array<{ weldId: string; reason: string }>
}

/**
 * 把可覆盖焊缝排入检测计划。幂等：该焊缝已有非“已退回重算”的计划行时不重复排。
 */
export function schedulePlans(input: {
  welds: ScopeWeld[]
  cards: WpsCard[]
  certs: WelderCertificate[]
  existing: PlanLine[]
  now: number
}): ScheduleOutcome {
  const { welds, cards, certs, existing, now } = input
  const results = resolveLedger(welds, cards, certs)
  const weldById = new Map(welds.map((w) => [w.id, w]))
  const lines = [...existing]
  const scheduled: string[] = []
  const skipped: Array<{ weldId: string; reason: string }> = []

  for (const result of results) {
    const weld = weldById.get(result.weldId)!
    const active = existing.find(
      (line) => line.weldId === result.weldId && line.state !== '已退回重算',
    )
    if (active) continue // 已在计划中（含待执行/已签字/已执行），不重复排

    if (result.stage !== '可排入') {
      if (!existing.some((line) => line.weldId === result.weldId)) {
        skipped.push({ weldId: result.weldId, reason: result.reason ?? result.stage })
      }
      continue
    }

    const basis = buildBasis(result, weld, certs)
    if (!basis) continue
    lines.push({
      id: `PL-${String(now).slice(-6)}-${result.weldId}`,
      weldId: result.weldId,
      state: '待执行',
      basis,
      createdAt: now,
    })
    scheduled.push(result.weldId)
  }

  return { lines, scheduled, skipped }
}

/** 批次签字：待执行行冻结为已签字 */
export function signBatch(lines: PlanLine[], weldIds: string[], batchNo: string, signedAt: string): PlanLine[] {
  const set = new Set(weldIds)
  return lines.map((line) =>
    set.has(line.weldId) && line.state === '待执行'
      ? { ...line, state: '已签字', batchNo, signedAt }
      : line,
  )
}

/**
 * 工艺卡更新（新版生效）后退回重算：
 * 仅同卡号、仍是“待执行”的计划行退回；已签字、已执行保留当时依据快照。
 * 重算后不再覆盖的焊缝由下一次排计划时自然跳过/重排。
 */
export function returnForRecompute(lines: PlanLine[], cardNo: string, newVersion: number, at: string): PlanLine[] {
  return lines.map((line) =>
    line.state === '待执行' && line.basis.wpsCardNo === cardNo
      ? {
          ...line,
          state: '已退回重算',
          returnReason: `工艺卡 ${cardNo} 发布 v${newVersion}（${at}），未执行计划退回重算`,
        }
      : line,
  )
}

/**
 * 证书录入（两个录入端可能同时提交同一证书号）。
 * 先到生效、后到留冲突；同号“待重试”续办转生效（幂等，不重复落账）。
 */
export interface AdmitOutcome {
  certs: WelderCertificate[]
  result: '生效' | '冲突' | '续办生效' | '待重试'
  certificateId: string
  conflictWith?: string
}

export function admitCertificate(
  certs: WelderCertificate[],
  incoming: Omit<WelderCertificate, 'id' | 'status' | 'submittedAt'> & { id: string; submittedAt: number },
  saveFailed: boolean,
): AdmitOutcome {
  const sameNo = certs.filter((c) => c.certificateNo === incoming.certificateNo)
  const effective = sameNo.find((c) => c.status === '生效')

  // 按证书号重试续办：此前有同号“待重试”时，
  //   本次保存成功(saveFailed=false) → 转生效；再次失败(saveFailed=true) → 保持待重试。
  const pending = sameNo.find((c) => c.status === '待重试')
  if (saveFailed) {
    if (pending) {
      return {
        certs,
        result: '待重试',
        certificateId: pending.id,
      }
    }
    return {
      certs: [...certs, { ...incoming, status: '待重试', saveError: '保存失败，等待按证书号重试续办' }],
      result: '待重试',
      certificateId: incoming.id,
    }
  }

  if (effective) {
    return {
      certs: [...certs, { ...incoming, status: '冲突', conflictWith: effective.id }],
      result: '冲突',
      certificateId: incoming.id,
      conflictWith: effective.id,
    }
  }

  // 尚无生效证书，重试保存成功 → 原待重试记录续办生效（复用记录，不重复落账）
  if (pending) {
    return {
      certs: certs.map((c) => (c.id === pending.id ? { ...c, ...incoming, id: pending.id, status: '生效', saveError: undefined } : c)),
      result: '续办生效',
      certificateId: pending.id,
    }
  }

  return {
    certs: [...certs, { ...incoming, status: '生效' }],
    result: '生效',
    certificateId: incoming.id,
  }
}
