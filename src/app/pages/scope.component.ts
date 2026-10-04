import { Component, inject, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { WeldState } from '../store/weld.reducer'
import * as A from '../store/weld.actions'
import type { ProcessCard, WelderCertificate } from '../types'

@Component({
  selector:'app-scope', standalone:true, imports:[CommonModule,FormsModule,TableModule,TagModule,ButtonModule,InputTextModule],
  template:`
    <main class="page"><div class="page-head"><div><p class="eyebrow">焊工资质 · 工艺卡 · 焊缝 · 检测计划</p><h1>范围账</h1><p>每道焊缝按作业日取工艺卡的方法、材料组别和位置，证书覆盖全部三项才排入；多证可覆盖时按最早到期安排，重叠范围单独列出。</p></div>
      <div class="head-actions"><p-button label="工艺卡更新（v3）" icon="pi pi-refresh" severity="secondary" (onClick)="updateWps()" /><p-button label="双端提交同一证书" icon="pi pi-users" severity="secondary" (onClick)="doubleSubmit()" /><p-button label="重算未执行计划" icon="pi pi-calculator" (onClick)="recalc()" /></div></div>

      <div class="grid-5">
        <article class="card metric"><span>可排焊缝</span><strong class="success">{{countStatus('可排')}}</strong><small>证书覆盖三项，可排入检测计划</small></article>
        <article class="card metric"><span>无覆盖</span><strong class="danger">{{countStatus('无覆盖')}}</strong><small>方法 / 材料 / 位置缺覆盖或证书过期</small></article>
        <article class="card metric"><span>待补录</span><strong class="warning">{{countStatus('待补录')}}</strong><small>旧焊缝缺工艺卡号，补录后再排</small></article>
        <article class="card metric"><span>证书冲突</span><strong class="danger">{{state.conflicts.length}}</strong><small>两端提交同一证书，先到生效后到留冲突</small></article>
        <article class="card metric"><span>保存失败待重试</span><strong class="warning">{{state.failedSaves.length}}</strong><small>按证书号重试续办，不重复排计划</small></article>
      </div>

      <div class="grid-scope">
        <section class="card"><h2 class="panel-title">焊缝范围账</h2>
          <p-table [value]="state.ledger" dataKey="weldId">
            <ng-template #header><tr><th>焊缝</th><th>作业日</th><th>工艺卡（版本）</th><th>方法</th><th>材料组别</th><th>位置</th><th>覆盖</th><th>选用证书</th><th>到期</th><th>重叠证书</th><th>原因 / 补录</th></tr></ng-template>
            <ng-template #body let-e>
              <tr>
                <td><b>{{e.weldId}}</b><small class="block">{{welderOf(e.weldId)}}</small></td>
                <td>{{e.workDate || '—'}}</td>
                <td>{{e.processCardNo ? (e.processCardNo + ' · v' + e.processCardVersion) : '—'}}</td>
                <td>{{e.method || '—'}}</td>
                <td>{{e.materialGroup || '—'}}</td>
                <td>{{e.position || '—'}}</td>
                <td><p-tag [value]="e.status" [severity]="e.status === '可排' ? 'success' : e.status === '无覆盖' ? 'danger' : 'warn'" /></td>
                <td>{{e.certificateNo || '—'}}</td>
                <td [class.danger]="e.certificateExpiry && e.certificateExpiry < asOf">{{e.certificateExpiry || '—'}}</td>
                <td><span class="overlap" *ngIf="e.overlapCertificateNos?.length">{{e.overlapCertificateNos.join('、')}}</span><span *ngIf="!e.overlapCertificateNos?.length">—</span></td>
                <td>
                  <span class="reason" *ngIf="e.status !== '待补录'">{{e.reason || '—'}}</span>
                  <div class="supplement" *ngIf="e.status === '待补录'"><input pInputText [(ngModel)]="supplementNo[e.weldId]" placeholder="工艺卡号 如 WPS-0101" /><p-button label="补录" size="small" (onClick)="supplement(e.weldId)" /></div>
                </td>
              </tr>
            </ng-template>
          </p-table>
        </section>

        <aside class="card"><h2 class="panel-title">待办</h2>
          <div class="todo" *ngFor="let f of state.failedSaves"><div><b>{{f.certificateNo}} · {{f.welder}}</b><small>{{f.terminal}} · {{f.reason}}</small></div><p-button label="按证书号重试" icon="pi pi-replay" size="small" (onClick)="retry(f.certificateNo)" /></div>
          <div class="todo empty" *ngIf="!state.failedSaves.length && !countStatus('待补录')"><p class="muted">无保存失败、无待补录焊缝。</p></div>
          <div class="todo" *ngIf="countStatus('待补录')"><div><b>{{countStatus('待补录')}} 条焊缝待补录工艺卡</b><small>在左侧台账录入工艺卡号后续办</small></div></div>
          <h2 class="panel-title mt-3">计划依据（签字留底）</h2>
          <div class="basis" *ngFor="let p of state.plans"><div class="basis-head"><b>{{p.id}}</b><p-tag [value]="p.signed ? '已签字' : p.state" [severity]="p.signed ? 'success' : p.state === '待执行' ? 'warn' : 'info'" /></div><small *ngFor="let b of p.basis">{{b.weldId}}：{{b.processCardNo}} v{{b.processCardVersion}} · {{b.method}}/{{b.materialGroup}}/{{b.position}} · {{b.certificateNo}}（{{b.certificateExpiry}}）</small><p class="muted" *ngIf="!p.basis?.length">无覆盖焊缝，未排入</p></div>
        </aside>
      </div>

      <section class="card mt-4" *ngIf="state.conflicts.length"><h2 class="panel-title">证书提交冲突（先到生效 · 后到留冲突）</h2>
        <p-table [value]="state.conflicts" dataKey="id"><ng-template #header><tr><th>冲突编号</th><th>证书号</th><th>焊工</th><th>先到端（生效）</th><th>后到端（留冲突）</th><th>先到时间</th><th>后到时间</th><th>说明</th></tr></ng-template><ng-template #body let-c><tr><td>{{c.id}}</td><td>{{c.certificateNo}}</td><td>{{c.welder}}</td><td class="success">{{c.winnerTerminal}}</td><td class="danger">{{c.loserTerminal}}</td><td>{{c.winnerSubmittedAt}}</td><td>{{c.loserSubmittedAt}}</td><td>{{c.detail}}</td></tr></ng-template></p-table>
      </section>

      <div class="grid-2 mt-4">
        <section class="card"><h2 class="panel-title">焊工证书（覆盖范围）</h2>
          <p-table [value]="state.certificates" dataKey="id"><ng-template #header><tr><th>证书号</th><th>焊工</th><th>方法</th><th>材料组别</th><th>位置</th><th>到期</th></tr></ng-template><ng-template #body let-c><tr><td>{{c.id}}</td><td>{{c.welder}}</td><td>{{c.methods.join('、')}}</td><td>{{c.materialGroups.join('、')}}</td><td>{{c.positions.join('、')}}</td><td [class.danger]="c.expiryDate < asOf">{{c.expiryDate}}</td></tr></ng-template></p-table>
        </section>
        <section class="card"><h2 class="panel-title">工艺卡版本</h2>
          <p-table [value]="state.processCards" dataKey="id"><ng-template #header><tr><th>工艺卡号</th><th>版本</th><th>方法</th><th>材料组别</th><th>位置</th><th>生效</th><th>失效</th></tr></ng-template><ng-template #body let-c><tr><td>{{c.id}}</td><td>v{{c.version}}</td><td>{{c.method}}</td><td>{{c.materialGroup}}</td><td>{{c.position}}</td><td>{{c.effectiveFrom}}</td><td>{{c.effectiveTo || '—'}}</td></tr></ng-template></p-table>
        </section>
      </div>
    </main>
  `,
  styles:[`
    .head-actions{display:flex;gap:8px;flex-wrap:wrap}.grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:16px}.grid-scope{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(320px,.8fr);gap:16px}.metric{border-left:4px solid #2563eb}.metric span,.metric small{display:block;color:#667085}.metric strong{display:block;font-size:26px;margin:6px 0 2px}.block{display:block;color:#7a8798;margin-top:3px}.overlap{color:#d97706;font-weight:600}.reason{color:#667085;font-size:12px}.supplement{display:flex;gap:6px}.supplement input{padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;width:150px}.todo{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #edf0f5}.todo b,.todo small{display:block}.todo small{color:#7a8798;margin-top:2px}.todo.empty{border-bottom:none}.basis{padding:10px 0;border-bottom:1px solid #edf0f5}.basis-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.basis small{display:block;color:#667085;font-size:12px;line-height:1.6}.mt-3{margin-top:12px}.mt-4{margin-top:16px}.muted{color:#7a8798;font-size:13px}
    @media(max-width:1100px){.grid-5{grid-template-columns:repeat(2,1fr)}.grid-scope{grid-template-columns:1fr}}
  `],
})
export class ScopeComponent implements OnInit {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  asOf = '2026-10-04'
  supplementNo: Record<string, string> = {}
  ngOnInit() { this.store.select('welds').subscribe((s) => this.state = s) }
  countStatus(status: string) { return (this.state?.ledger ?? []).filter((e) => e.status === status).length }
  welderOf(weldId: string) { return this.state?.welds.find((w) => w.id === weldId)?.welder ?? '' }

  /** 工艺卡更新：WPS-0101 升级 v3（位置改为横焊），未执行计划重算、已签字留依据 */
  updateWps() {
    const card: ProcessCard = { id:'WPS-0101', version:3, method:'GMAW', materialGroup:'Fe-3', position:'横焊', effectiveFrom:'2026-09-16' }
    this.store.dispatch(A.updateProcessCard({ card }))
  }

  /** 两个录入端同时提交同一证书：先到生效，后到留冲突 */
  doubleSubmit() {
    const base: WelderCertificate = { id:'CERT-SP-02', welder:'孙鹏', methods:['GTAW'], materialGroups:['Fe-8'], positions:['立焊'], issueDate:'2025-06-01', expiryDate:'2027-12-31' }
    this.store.dispatch(A.submitCertificate({ certificate:{ ...base, terminal:'A端', submittedAt:'2026-10-04 10:00:00' } }))
    this.store.dispatch(A.submitCertificate({ certificate:{ ...base, terminal:'B端', submittedAt:'2026-10-04 10:00:01' } }))
  }

  recalc() { this.store.dispatch(A.recalcPlans()) }
  retry(certificateNo: string) { this.store.dispatch(A.retryCertificate({ certificateNo })) }
  supplement(weldId: string) {
    const no = this.supplementNo[weldId]?.trim()
    if (no) { this.store.dispatch(A.supplementProcessCard({ weldId, processCardNo: no })); this.supplementNo[weldId] = '' }
  }
}
