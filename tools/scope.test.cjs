const test = require('node:test')
const assert = require('node:assert')
const {
  effectiveWps,
  resolveLedger,
  schedulePlans,
  signBatch,
  returnForRecompute,
  admitCertificate,
} = require('../dist-scope/scope.engine.js')
const { seedWpsCards, seedWelds, seedCerts, seedPlanLines, wps017V2 } = require('../dist-scope/scope.seed.js')

const weld = (id) => seedWelds.find((w) => w.id === id)

test('旧焊缝无工艺卡号 → 待补录', () => {
  const [r] = resolveLedger([weld('W-098')], seedWpsCards, seedCerts).filter((x) => x.weldId === 'W-098')
  assert.strictEqual(r.stage, '待补录工艺卡')
  assert.strictEqual(r.chosen, undefined)
})

test('按作业日取工艺卡版本：作业日早于 v2 生效日仍取 v1', () => {
  const cards = [...seedWpsCards, wps017V2]
  const w205 = effectiveWps(weld('W-205'), cards) // 作业 2026-10-03
  const w201 = effectiveWps(weld('W-201'), cards) // 作业 2026-10-05
  assert.strictEqual(w205.version, 1)
  assert.strictEqual(w201.version, 2)
})

test('三项全覆盖 + 双证按最早到期：W-201 选 GW-2026-003，且列出重叠', () => {
  const r = resolveLedger(seedWelds, seedWpsCards, seedCerts).find((x) => x.weldId === 'W-201')
  assert.strictEqual(r.stage, '可排入')
  assert.strictEqual(r.chosen.certificateNo, 'GW-2026-003') // 2027-03-31 最早到期
  const nos = r.overlaps.map((o) => o.certificateNo)
  assert.deepStrictEqual(nos, ['GW-2026-003', 'GW-2026-002', 'GW-2026-001'])
})

test('证书过期：W-203 三项都被覆盖但作业日已过有效期 → 不覆盖', () => {
  const r = resolveLedger(seedWelds, seedWpsCards, seedCerts).find((x) => x.weldId === 'W-203')
  assert.strictEqual(r.stage, '资质不覆盖')
  assert.strictEqual(r.overlaps.length, 1)
  assert.strictEqual(r.gap.expiredCoverers[0].certificateNo, 'SP-2026-010')
})

test('缺位置项：W-204 证书没有 PE → 位置未覆盖', () => {
  const r = resolveLedger(seedWelds, seedWpsCards, seedCerts).find((x) => x.weldId === 'W-204')
  assert.strictEqual(r.stage, '资质不覆盖')
  assert.strictEqual(r.gap.positionMissing, true)
  assert.strictEqual(r.gap.methodMissing, false)
  assert.strictEqual(r.gap.materialGroupMissing, false)
})

test('排计划幂等：已在待执行计划的 W-201 不重复排，W-202 新排，W-203/204/098 跳过', () => {
  const out1 = schedulePlans({ welds: seedWelds, cards: seedWpsCards, certs: seedCerts, existing: seedPlanLines, now: 1759500000000 })
  assert.deepStrictEqual(out1.scheduled, ['W-202'])
  const skipIds = out1.skipped.map((s) => s.weldId)
  assert.deepStrictEqual(skipIds.sort(), ['W-098', 'W-203', 'W-204'])
  const out2 = schedulePlans({ welds: seedWelds, cards: seedWpsCards, certs: seedCerts, existing: out1.lines, now: 1759500001000 })
  assert.deepStrictEqual(out2.scheduled, [])
})

test('工艺卡更新只退回待执行行；已签字 W-205 保留 v1 依据', () => {
  const scheduled = schedulePlans({ welds: seedWelds, cards: seedWpsCards, certs: seedCerts, existing: seedPlanLines, now: 1759500000000 }).lines
  const returned = returnForRecompute(scheduled, 'WPS-017', 2, '2026-10-05')
  const w201 = returned.find((l) => l.weldId === 'W-201')
  const w202 = returned.find((l) => l.weldId === 'W-202')
  const w205 = returned.find((l) => l.weldId === 'W-205')
  assert.strictEqual(w201.state, '已退回重算')
  assert.strictEqual(w202.state, '已退回重算')
  assert.strictEqual(w205.state, '已签字')
  assert.strictEqual(w205.basis.wpsVersion, 1)
  assert.strictEqual(w205.basis.position, 'PF')
})

test('退回后重算：W-201 按 v2(PB) 重排，选中证书切换为覆盖 PB 的 GW-2026-001', () => {
  const returned = returnForRecompute(
    schedulePlans({ welds: seedWelds, cards: seedWpsCards, certs: seedCerts, existing: seedPlanLines, now: 1759500000000 }).lines,
    'WPS-017', 2, '2026-10-05',
  )
  const cards = [...seedWpsCards, wps017V2]
  const resched = schedulePlans({ welds: seedWelds, cards, certs: seedCerts, existing: returned, now: 1759600000000 })
  assert.deepStrictEqual(resched.scheduled.sort(), ['W-201', 'W-202'])
  const w201 = resched.lines.find((l) => l.weldId === 'W-201' && l.state === '待执行')
  assert.strictEqual(w201.basis.wpsVersion, 2)
  assert.strictEqual(w201.basis.position, 'PB')
  assert.strictEqual(w201.basis.certificateNo, 'GW-2026-001')
  // 已签字行依旧只有一条，依据不动
  const signed = resched.lines.filter((l) => l.weldId === 'W-205')
  assert.strictEqual(signed.length, 1)
  assert.strictEqual(signed[0].basis.certificateNo, 'GW-2026-003')
})

test('签字把待执行冻结为已签字并带批次号', () => {
  const signed = signBatch(seedPlanLines, ['W-201'], 'IP-TEST', '2026-10-04 10:00')
  assert.strictEqual(signed.find((l) => l.weldId === 'W-201').state, '已签字')
  assert.strictEqual(signed.find((l) => l.weldId === 'W-201').batchNo, 'IP-TEST')
})

test('同证书号两录入端：先到生效，后到留冲突', () => {
  const incoming = {
    id: 'C-DUP', certificateNo: 'GW-2026-001', welder: '王凯',
    methods: ['GMAW'], materialGroups: ['Fe-I'], positions: ['PF'],
    validFrom: '2026-01-01', validUntil: '2028-01-01', terminal: '录入端B', submittedAt: 99,
  }
  const out = admitCertificate(seedCerts, incoming, false)
  assert.strictEqual(out.result, '冲突')
  const dup = out.certs.find((c) => c.id === 'C-DUP')
  assert.strictEqual(dup.status, '冲突')
  assert.ok(dup.conflictWith)
  // 原证书仍只有一份生效
  assert.strictEqual(out.certs.filter((c) => c.certificateNo === 'GW-2026-001' && c.status === '生效').length, 1)
})

test('保存失败 → 待重试；按证书号重试续办转生效，且不新增记录（幂等）', () => {
  const base = {
    certificateNo: 'GW-NEW-999', welder: '赵明',
    methods: ['FCAW'], materialGroups: ['Fe-III'], positions: ['PE'],
    validFrom: '2026-01-01', validUntil: '2028-12-31', terminal: '录入端A',
  }
  const failed = admitCertificate(seedCerts, { ...base, id: 'C-F1', submittedAt: 1 }, true)
  assert.strictEqual(failed.result, '待重试')
  assert.strictEqual(failed.certs.filter((c) => c.certificateNo === 'GW-NEW-999').length, 1)

  // 再次失败：仍是同一条待重试，不新增
  const failedAgain = admitCertificate(failed.certs, { ...base, id: 'C-F2', submittedAt: 2 }, true)
  assert.strictEqual(failedAgain.result, '待重试')
  assert.strictEqual(failedAgain.certs.filter((c) => c.certificateNo === 'GW-NEW-999').length, 1)

  // 重试成功：复用记录转生效，仍只有一条
  const ok = admitCertificate(failedAgain.certs, { ...base, id: 'C-F3', submittedAt: 3 }, false)
  assert.strictEqual(ok.result, '续办生效')
  const rows = ok.certs.filter((c) => c.certificateNo === 'GW-NEW-999')
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].status, '生效')
  assert.strictEqual(rows[0].id, 'C-F1')
})
