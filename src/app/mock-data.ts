import type {
  CertificateConflict,
  FailedSave,
  InspectionPlan,
  ProcessCard,
  WelderCertificate,
  Weld,
} from './types'

/** 统计基准日（演示用“今天”） */
export const AS_OF = '2026-10-04'

export const mockWelds: Weld[] = [
  { id:'W-101', drawing:'SG-04-钢柱', component:'KZ-12 / 柱翼缘', joint:'全熔透坡口焊', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:100, requiredRatio:100, status:'合格', x:18, y:24, repairs:0, defects:[], processCardNo:'WPS-0101', workDate:'2026-09-10' },
  { id:'W-104', drawing:'SG-07-屋面梁', component:'GL-21 / 下翼缘', joint:'对接焊缝', method:'SAW', welder:'刘强', qualification:'GB/T 9448 · 2028-03', qualificationValid:true, inspectionRatio:100, requiredRatio:100, status:'待复检', x:48, y:38, repairs:2, defects:[{id:'D-31',position:42,type:'夹渣',length:12,level:'Ⅱ级',method:'UT',report:'UT-2026-0918'}], processCardNo:'WPS-0104', workDate:'2026-09-12' },
  { id:'W-107', drawing:'SG-07-屋面梁', component:'GL-21 / 腹板', joint:'角焊缝', method:'FCAW', welder:'赵明', qualification:'GB/T 9448 · 2027-01', qualificationValid:true, inspectionRatio:20, requiredRatio:20, status:'返修中', x:61, y:42, repairs:1, defects:[{id:'D-32',position:68,type:'未熔合',length:18,level:'Ⅲ级',method:'MT',report:'MT-2026-0921'}], processCardNo:'WPS-0103', workDate:'2026-09-14' },
  { id:'W-109', drawing:'SG-12-平台梁', component:'PL-08 / 节点板', joint:'角焊缝', method:'SMAW', welder:'孙鹏', qualification:'GB/T 9448 · 2026-10-01', qualificationValid:false, inspectionRatio:10, requiredRatio:20, status:'待检测', x:78, y:60, repairs:0, defects:[], processCardNo:'WPS-0102', workDate:'2026-09-15' },
  { id:'W-112', drawing:'SG-12-平台梁', component:'PL-08 / 腹板', joint:'组合焊缝', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:50, requiredRatio:50, status:'已关闭', x:36, y:68, repairs:0, defects:[], processCardNo:'WPS-0101', workDate:'2026-09-18' },
  // 旧焊缝：无工艺卡号，待补录（有作业日，补录卡号后即可排）
  { id:'W-201', drawing:'SG-04-钢柱', component:'KZ-12 / 柱底板', joint:'角焊缝', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:0, requiredRatio:100, status:'待检测', x:24, y:52, repairs:0, defects:[], workDate:'2026-09-08' },
  // 证书方法 / 材料组别不覆盖
  { id:'W-202', drawing:'SG-09-管桁架', component:'HJ-03 / 相贯节点', joint:'对接焊缝', method:'GTAW', welder:'刘强', qualification:'GB/T 9448 · 2028-03', qualificationValid:true, inspectionRatio:0, requiredRatio:100, status:'待检测', x:84, y:30, repairs:0, defects:[], processCardNo:'WPS-0105', workDate:'2026-09-19' },
]

export const mockCertificates: WelderCertificate[] = [
  // 王凯两证均可覆盖 GMAW / Fe-1 / 平焊 → 取最早到期 CERT-WK-02，重叠 CERT-WK-01
  { id:'CERT-WK-01', welder:'王凯', methods:['GMAW','FCAW'], materialGroups:['Fe-1','Fe-3'], positions:['平焊','横焊'], issueDate:'2025-01-01', expiryDate:'2027-06-30', terminal:'A端', submittedAt:'2026-09-01 09:12' },
  { id:'CERT-WK-02', welder:'王凯', methods:['GMAW'], materialGroups:['Fe-1','Fe-3'], positions:['平焊'], issueDate:'2025-06-01', expiryDate:'2027-03-31', terminal:'A端', submittedAt:'2026-09-01 09:15' },
  { id:'CERT-LQ-01', welder:'刘强', methods:['SAW','GMAW'], materialGroups:['Fe-3','Fe-4'], positions:['平焊','横焊','立焊'], issueDate:'2024-09-01', expiryDate:'2028-03-31', terminal:'A端', submittedAt:'2026-09-02 10:00' },
  { id:'CERT-ZM-01', welder:'赵明', methods:['FCAW'], materialGroups:['Fe-1','Fe-3'], positions:['立焊','仰焊'], issueDate:'2025-03-01', expiryDate:'2027-01-31', terminal:'A端', submittedAt:'2026-09-02 10:20' },
  // 孙鹏：只覆盖 SMAW / Fe-1 / 平焊，W-109 要求横焊 → 无覆盖；且已过期
  { id:'CERT-SP-01', welder:'孙鹏', methods:['SMAW'], materialGroups:['Fe-1'], positions:['平焊'], issueDate:'2023-10-01', expiryDate:'2026-10-01', terminal:'A端', submittedAt:'2026-09-02 10:40' },
]

export const mockProcessCards: ProcessCard[] = [
  // WPS-0101 有版本更新：v1 Fe-1，v2(2026-09-15起) Fe-3 → 未执行计划重算依据
  { id:'WPS-0101', version:1, method:'GMAW', materialGroup:'Fe-1', position:'平焊', effectiveFrom:'2026-01-01', effectiveTo:'2026-09-14' },
  { id:'WPS-0101', version:2, method:'GMAW', materialGroup:'Fe-3', position:'平焊', effectiveFrom:'2026-09-15' },
  { id:'WPS-0102', version:1, method:'SMAW', materialGroup:'Fe-1', position:'横焊', effectiveFrom:'2026-01-01' },
  { id:'WPS-0103', version:1, method:'FCAW', materialGroup:'Fe-1', position:'立焊', effectiveFrom:'2026-01-01' },
  { id:'WPS-0104', version:1, method:'SAW', materialGroup:'Fe-3', position:'平焊', effectiveFrom:'2026-01-01' },
  { id:'WPS-0105', version:1, method:'GTAW', materialGroup:'Fe-8', position:'立焊', effectiveFrom:'2026-01-01' },
]

export const mockPlans: InspectionPlan[] = [
  // 已签字批次：W-101 作业日 2026-09-10 取 WPS-0101 v1(Fe-1)，签字后即使工艺卡更新也留 v1 依据
  { id:'IP-2026-0928-A', date:'2026-09-28', method:'UT', weldIds:['W-101'], inspector:'陈锋', state:'已完成', signed:true,
    basis:[{ weldId:'W-101', processCardNo:'WPS-0101', processCardVersion:1, method:'GMAW', materialGroup:'Fe-1', position:'平焊', certificateNo:'CERT-WK-02', certificateExpiry:'2027-03-31' }] },
  // 未执行计划：W-112 作业日 2026-09-18，工艺卡更新后重算为 v2(Fe-3)
  { id:'IP-2026-0929-B', date:'2026-09-29', method:'UT', weldIds:['W-112'], inspector:'赵岚', state:'待执行',
    basis:[{ weldId:'W-112', processCardNo:'WPS-0101', processCardVersion:1, method:'GMAW', materialGroup:'Fe-1', position:'平焊', certificateNo:'CERT-WK-02', certificateExpiry:'2027-03-31' }] },
  { id:'IP-2026-0930-C', date:'2026-09-30', method:'UT + MT', weldIds:['W-104','W-107'], inspector:'陈锋', state:'待执行',
    basis:[
      { weldId:'W-104', processCardNo:'WPS-0104', processCardVersion:1, method:'SAW', materialGroup:'Fe-3', position:'平焊', certificateNo:'CERT-LQ-01', certificateExpiry:'2028-03-31' },
      { weldId:'W-107', processCardNo:'WPS-0103', processCardVersion:1, method:'FCAW', materialGroup:'Fe-1', position:'立焊', certificateNo:'CERT-ZM-01', certificateExpiry:'2027-01-31' },
    ] },
]

export const mockConflicts: CertificateConflict[] = []

/** 刘强第二份证书保存失败，按证书号重试续办；该证覆盖 GTAW / Fe-8 / 立焊，可让 W-202 重新可排 */
export const mockFailedSaves: FailedSave[] = [
  {
    certificateNo:'CERT-LQ-02', welder:'刘强', terminal:'B端', reason:'网络中断，证书保存未确认', failedAt:'2026-10-03 17:42', retryCount:0,
    certificate:{ id:'CERT-LQ-02', welder:'刘强', methods:['GTAW'], materialGroups:['Fe-8'], positions:['立焊'], issueDate:'2025-05-01', expiryDate:'2028-06-30', terminal:'B端', submittedAt:'2026-10-03 17:42' },
  },
]
