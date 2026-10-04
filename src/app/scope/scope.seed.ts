import type { PlanLine, ScopeAuditEvent, ScopeWeld, WelderCertificate, WpsCard } from './scope.types'

// 基准日：2026-10-04。工艺卡按作业日取版本，证书按作业日判断有效期。

export const seedWpsCards: WpsCard[] = [
  { cardNo: 'WPS-017', version: 1, method: 'GMAW', materialGroup: 'Fe-I', position: 'PF', effectiveFrom: '2026-09-01', remark: '屋面梁立焊初版' },
  { cardNo: 'WPS-022', version: 1, method: 'SMAW', materialGroup: 'Fe-II', position: 'PC', effectiveFrom: '2026-09-05' },
  { cardNo: 'WPS-030', version: 1, method: 'SAW', materialGroup: 'Fe-I', position: 'PA', effectiveFrom: '2026-08-20' },
  { cardNo: 'WPS-041', version: 1, method: 'FCAW', materialGroup: 'Fe-III', position: 'PE', effectiveFrom: '2026-09-10' },
]

export const seedWelds: ScopeWeld[] = [
  // W-201/W-202 作业日在 v2 生效日之后：计划已按 v1 排好、作业前工艺卡更新 → 退回重算
  { id: 'W-201', drawing: 'SG-07-屋面梁', component: 'GL-21 / 上翼缘', workDate: '2026-10-05', welder: '王凯', wpsCardNo: 'WPS-017' },
  { id: 'W-202', drawing: 'SG-07-屋面梁', component: 'GL-21 / 下翼缘', workDate: '2026-10-06', welder: '王凯', wpsCardNo: 'WPS-017' },
  { id: 'W-203', drawing: 'SG-12-平台梁', component: 'PL-08 / 对接', workDate: '2026-10-03', welder: '孙鹏', wpsCardNo: 'WPS-022' },
  { id: 'W-204', drawing: 'SG-04-钢柱', component: 'KZ-12 / 腹板', workDate: '2026-10-02', welder: '赵明', wpsCardNo: 'WPS-041' },
  // W-205 作业与签字均在 v1 期内，v2 发布后仍保留当时依据
  { id: 'W-205', drawing: 'SG-07-屋面梁', component: 'GL-21 / 端板', workDate: '2026-10-03', welder: '王凯', wpsCardNo: 'WPS-017' },
  { id: 'W-098', drawing: 'SG-01-旧图', component: 'KZ-01 / 旧节点', workDate: '2026-08-15', welder: '老焊工', wpsCardNo: null },
]

export const seedCerts: WelderCertificate[] = [
  // 王凯：C-1/C-2/C-3 对 WPS-017（GMAW+Fe-I+PF）三项全覆盖，按最早到期应选 C-3
  { id: 'C-1', certificateNo: 'GW-2026-001', welder: '王凯', methods: ['GMAW', 'SAW'], materialGroups: ['Fe-I', 'Fe-II'], positions: ['PA', 'PB', 'PF'], validFrom: '2025-06-01', validUntil: '2028-06-30', terminal: '录入端A', status: '生效', submittedAt: 1 },
  { id: 'C-2', certificateNo: 'GW-2026-002', welder: '王凯', methods: ['GMAW'], materialGroups: ['Fe-I'], positions: ['PF'], validFrom: '2026-01-01', validUntil: '2027-12-31', terminal: '录入端B', status: '生效', submittedAt: 2 },
  { id: 'C-3', certificateNo: 'GW-2026-003', welder: '王凯', methods: ['GMAW', 'FCAW'], materialGroups: ['Fe-I'], positions: ['PF', 'PE'], validFrom: '2025-09-01', validUntil: '2027-03-31', terminal: '录入端A', status: '生效', submittedAt: 3 },
  // 孙鹏：SMAW+Fe-II+PC 三项全覆盖，但作业日 2026-10-03 已过期
  { id: 'C-4', certificateNo: 'SP-2026-010', welder: '孙鹏', methods: ['SMAW', 'GMAW'], materialGroups: ['Fe-I', 'Fe-II'], positions: ['PA', 'PC'], validFrom: '2024-03-01', validUntil: '2026-10-01', terminal: '录入端A', status: '生效', submittedAt: 4 },
  // 赵明：材料/方法都在，但位置只到 PD，缺 PE
  { id: 'C-5', certificateNo: 'ZM-2026-007', welder: '赵明', methods: ['FCAW', 'GMAW'], materialGroups: ['Fe-II', 'Fe-III'], positions: ['PA', 'PB', 'PD'], validFrom: '2025-11-01', validUntil: '2028-05-31', terminal: '录入端B', status: '生效', submittedAt: 5 },
]

// W-201 已在未执行计划中（工艺卡更新后应退回）；W-205 已签字（应保留当时依据）
export const seedPlanLines: PlanLine[] = [
  {
    id: 'PL-000201-W-201',
    weldId: 'W-201',
    state: '待执行',
    createdAt: 1759300000000,
    basis: {
      welder: '王凯', workDate: '2026-10-05', wpsCardNo: 'WPS-017', wpsVersion: 1,
      method: 'GMAW', materialGroup: 'Fe-I', position: 'PF',
      certificateId: 'C-3', certificateNo: 'GW-2026-003', certValidUntil: '2027-03-31',
    },
  },
  {
    id: 'PL-000202-W-205',
    weldId: 'W-205',
    state: '已签字',
    batchNo: 'IP-2026-1003-A',
    signedAt: '2026-10-03 17:40',
    createdAt: 1759200000000,
    basis: {
      welder: '王凯', workDate: '2026-10-03', wpsCardNo: 'WPS-017', wpsVersion: 1,
      method: 'GMAW', materialGroup: 'Fe-I', position: 'PF',
      certificateId: 'C-3', certificateNo: 'GW-2026-003', certValidUntil: '2027-03-31',
    },
  },
]

export const seedAudit: ScopeAuditEvent[] = [
  { id: 'SA-1', time: '2026-10-03 17:40', actor: '质量负责人', action: '批次签字', target: 'IP-2026-1003-A', detail: 'W-205 按 WPS-017 v1 + GW-2026-003 落账签字，依据快照冻结' },
]

// 演示动作：WPS-017 发布 v2（位置 PF→PB），2026-10-05 生效
export const wps017V2: WpsCard = {
  cardNo: 'WPS-017', version: 2, method: 'GMAW', materialGroup: 'Fe-I', position: 'PB',
  effectiveFrom: '2026-10-05', remark: '立焊改平角焊位置，作业指导更新',
}
