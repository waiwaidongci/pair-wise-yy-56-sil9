import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { admitCertificate, publishWps, schedulePlans, signBatch } from './scope.actions'
import {
  admitCertificate as admitCertEngine,
  resolveLedger,
  returnForRecompute,
  schedulePlans as scheduleEngine,
  signBatch as signEngine,
} from './scope.engine'
import { wps017V2 } from './scope.seed'
import { ScopeState } from './scope.reducer'
import type { CoverageResult, ScopeWeld, WelderCertificate } from './scope.types'

type Tab = 'ledger' | 'plans' | 'wps' | 'certs'

@Component({
  selector: 'app-scope-ledger',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, InputTextModule],
  template: `
    <main class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">资质 × 工艺卡 × 焊缝 × 检测计划</p>
          <h1>焊工资质范围账</h1>
          <p>每道焊缝按作业日取工艺卡的方法、材料组别、位置；证书三项全覆盖且在有效期内才排入，只认焊工姓名不再放行。</p>
        </div>
        <p-button label="排检测计划" icon="pi pi-calendar-plus" (onClick)="doSchedule()" />
      </div>

      <div class="grid-4">
        <article class="card metric"><span>焊缝总数</span><strong>{{state.welds.length}}</strong><small>按作业日逐道取工艺卡</small></article>
        <article class="card metric"><span>可排入</span><strong class="success">{{countStage('可排入')}}</strong><small>三项全覆盖且证书有效</small></article>
        <article class="card metric"><span>资质不覆盖</span><strong class="danger">{{countStage('资质不覆盖')}}</strong><small>缺项或证书过期</small></article>
        <article class="card metric"><span>待补录工艺卡</span><strong class="warning">{{countStage('待补录工艺卡')}}</strong><small>旧焊缝先补卡号</small></article>
      </div>

      <div class="notice card" *ngIf="state.lastNotice"><i class="pi pi-info-circle"></i><span>{{state.lastNotice}}</span></div>

      <div class="tabs card">
        <button [class.active]="tab==='ledger'" (click)="tab='ledger'">范围账核对</button>
        <button [class.active]="tab==='plans'" (click)="tab='plans'">检测计划（{{state.planLines.length}}）</button>
        <button [class.active]="tab==='wps'" (click)="tab='wps'">工艺卡更新</button>
        <button [class.active]="tab==='certs'" (click)="tab='certs'">证书录入 / 冲突（{{state.certs.length}}）</button>
      </div>

      <!-- 1. 范围账核对 -->
      <section class="card" *ngIf="tab==='ledger'">
        <h2 class="panel-title">逐道焊缝范围核对（作业日 → 工艺卡 → 证书三项）</h2>
        <p-table [value]="ledger" [paginator]="true" [rows]="8" dataKey="weldId">
          <ng-template #header>
            <tr><th>焊缝 / 构件</th><th>作业日 / 焊工</th><th>工艺卡依据</th><th>方法·材料·位置</th><th>选中证书（最早到期）</th><th>重叠覆盖</th><th>结论</th></tr>
          </ng-template>
          <ng-template #body let-r>
            <tr [class.blocked]="r.stage!=='可排入'">
              <td><b>{{r.weldId}}</b><small class="block">{{weld(r.weldId)?.component}}</small></td>
              <td>{{r.workDate}}<small class="block">{{r.welder}}</small></td>
              <td>
                <ng-container *ngIf="r.triple; else noCard">{{r.wpsCardNo}} <b>v{{r.triple.wpsVersion}}</b></ng-container>
                <ng-template #noCard><span class="warning">{{r.wpsCardNo ?? '无卡号'}}</span></ng-template>
              </td>
              <td>
                <ng-container *ngIf="r.triple">
                  <span class="chip">{{r.triple.method}}</span><span class="chip">{{r.triple.materialGroup}}</span><span class="chip">{{r.triple.position}}</span>
                </ng-container>
                <span class="muted" *ngIf="!r.triple">—</span>
              </td>
              <td>
                <ng-container *ngIf="r.chosen"><b>{{r.chosen.certificateNo}}</b><small class="block">有效期至 {{r.chosen.validUntil}}</small></ng-container>
                <div class="gap" *ngIf="r.stage==='资质不覆盖'">
                  <span class="tagmiss" *ngIf="r.gap?.methodMissing">方法未覆盖</span>
                  <span class="tagmiss" *ngIf="r.gap?.materialGroupMissing">材料未覆盖</span>
                  <span class="tagmiss" *ngIf="r.gap?.positionMissing">位置未覆盖</span>
                  <span class="tagmiss" *ngFor="let e of r.gap?.expiredCoverers">证书 {{e.certificateNo}} 已过期（{{e.validUntil}}）</span>
                </div>
                <small class="warning block" *ngIf="r.stage==='待补录工艺卡'">{{r.reason}}</small>
              </td>
              <td>
                <span class="chip-overlap" *ngFor="let o of r.overlaps" [class.chosen]="o.certificateId===r.chosen?.certificateId" [title]="o.certificateId===r.chosen?.certificateId ? '最早到期，已选中' : '同样三项全覆盖'">
                  {{o.certificateNo}}<small>至{{o.validUntil.slice(2)}}</small>
                </span>
                <span class="muted" *ngIf="!r.overlaps.length">无</span>
              </td>
              <td><p-tag [value]="r.stage" [severity]="stageSeverity(r.stage)" /></td>
            </tr>
          </ng-template>
        </p-table>
        <p class="hint">重叠覆盖列出对同一“方法+材料+位置”三项都覆盖的证书；两份都覆盖时按<b>最早到期</b>安排（深色为选中）。</p>
      </section>

      <!-- 2. 检测计划 -->
      <section class="card" *ngIf="tab==='plans'">
        <div class="toolbar">
          <h2 class="panel-title" style="margin:0">检测计划与落账依据</h2>
          <span class="spacer"></span>
          <p-button label="排计划（幂等，不重复排）" icon="pi pi-calendar-plus" severity="secondary" (onClick)="doSchedule()" />
          <p-button label="签字选中批次" icon="pi pi-lock" [disabled]="!selected.size" (onClick)="signSelected()" />
        </div>
        <p-table [value]="state.planLines" [paginator]="true" [rows]="8" dataKey="id">
          <ng-template #header>
            <tr><th style="width:42px"></th><th>计划行 / 焊缝</th><th>状态</th><th>批次 / 签字</th><th>当时依据（冻结快照）</th><th>退回原因</th></tr>
          </ng-template>
          <ng-template #body let-line>
            <tr [class.returned]="line.state==='已退回重算'">
              <td><input type="checkbox" [checked]="selected.has(line.weldId)" [disabled]="line.state!=='待执行'" (change)="toggle(line.weldId)" /></td>
              <td><b>{{line.id}}</b><small class="block">{{line.weldId}} · {{weld(line.weldId)?.component}} · 作业 {{line.basis.workDate}}</small></td>
              <td><p-tag [value]="line.state" [severity]="line.state==='已签字'?'success':line.state==='已执行'?'info':line.state==='已退回重算'?'danger':'warn'" /></td>
              <td>{{line.batchNo ?? '—'}}<small class="block">{{line.signedAt ?? ''}}</small></td>
              <td>
                {{line.basis.wpsCardNo}} v{{line.basis.wpsVersion}} ·
                <span class="chip">{{line.basis.method}}</span><span class="chip">{{line.basis.materialGroup}}</span><span class="chip">{{line.basis.position}}</span>
                <small class="block">证书 {{line.basis.certificateNo}}（至 {{line.basis.certValidUntil}}）· 焊工 {{line.basis.welder}}</small>
              </td>
              <td><small class="danger">{{line.returnReason ?? ''}}</small></td>
            </tr>
          </ng-template>
        </p-table>
        <p class="hint">已签字 / 已执行行的“当时依据”永久保留；工艺卡更新后只退回“待执行”行。</p>
      </section>

      <!-- 3. 工艺卡更新 -->
      <section class="card" *ngIf="tab==='wps'">
        <div class="toolbar">
          <h2 class="panel-title" style="margin:0">焊接工艺卡（WPS）版本</h2>
          <span class="spacer"></span>
          <p-button [label]="v2Published ? 'WPS-017 v2 已发布' : '发布 WPS-017 v2（位置 PF→PB，2026-10-05 生效）'" icon="pi pi-upload" [disabled]="v2Published" (onClick)="publishV2()" />
          <p-button label="发布后重排（重算退回行）" icon="pi pi-refresh" severity="secondary" [disabled]="!v2Published" (onClick)="doSchedule()" />
        </div>
        <p-table [value]="wpsRows" dataKey="key">
          <ng-template #header><tr><th>卡号 / 版本</th><th>方法</th><th>材料组别</th><th>位置</th><th>生效日</th><th>说明</th></tr></ng-template>
          <ng-template #body let-row>
            <tr [class.isnew]="row.isNew">
              <td><b>{{row.cardNo}}</b> v{{row.version}} <span class="chip-new" *ngIf="row.isNew">新版</span></td>
              <td>{{row.method}}</td><td>{{row.materialGroup}}</td><td>{{row.position}}</td><td>{{row.effectiveFrom}}</td><td class="muted">{{row.remark ?? ''}}</td>
            </tr>
          </ng-template>
        </p-table>
        <p class="hint">
          发布 v2 后：W-201（待执行）退回重算 → 重排时按作业日 10-05 取 v2（位置 PB），选中证书由 GW-2026-003 变为覆盖 PB 的 GW-2026-001；
          W-205 已签字，仍保留 v1 / PF / GW-2026-003 的当时依据。
        </p>
      </section>

      <!-- 4. 证书录入 -->
      <section class="card" *ngIf="tab==='certs'">
        <div class="grid-2">
          <div>
            <h2 class="panel-title">焊工证书台账</h2>
            <p-table [value]="state.certs" [paginator]="true" [rows]="7" dataKey="id">
              <ng-template #header><tr><th>证书号 / 焊工</th><th>方法</th><th>材料</th><th>位置</th><th>有效期</th><th>状态</th><th>操作</th></tr></ng-template>
              <ng-template #body let-c>
                <tr [class.conflict]="c.status==='冲突'">
                  <td><b>{{c.certificateNo}}</b><small class="block">{{c.welder}} · {{c.terminal}}</small></td>
                  <td><span class="chip" *ngFor="let m of c.methods">{{m}}</span></td>
                  <td><span class="chip" *ngFor="let g of c.materialGroups">{{g}}</span></td>
                  <td><span class="chip" *ngFor="let p of c.positions">{{p}}</span></td>
                  <td><small>{{c.validFrom}}<br>至 {{c.validUntil}}</small></td>
                  <td>
                    <p-tag [value]="c.status" [severity]="c.status==='生效'?'success':c.status==='冲突'?'danger':'warn'" />
                    <small class="block danger" *ngIf="c.status==='冲突'">与 {{certNo(c.conflictWith)}} 同号，后到</small>
                    <small class="block warning" *ngIf="c.saveError">{{c.saveError}}</small>
                  </td>
                  <td><p-button *ngIf="c.status==='待重试'" label="按号重试续办" size="small" (onClick)="retry(c)" /></td>
                </tr>
              </ng-template>
            </p-table>
          </div>
          <div>
            <h2 class="panel-title">两个录入端提交</h2>
            <div class="form">
              <label>录入端</label>
              <select [(ngModel)]="form.terminal"><option>录入端A</option><option>录入端B</option></select>
              <label>证书号（同号后到留冲突）</label>
              <input pInputText [(ngModel)]="form.certificateNo" />
              <label>焊工姓名（现场只认姓名）</label>
              <input pInputText [(ngModel)]="form.welder" />
              <label>覆盖方法（逗号分隔，如 GMAW,SAW）</label>
              <input pInputText [(ngModel)]="form.methods" />
              <label>覆盖材料组别（如 Fe-I,Fe-II）</label>
              <input pInputText [(ngModel)]="form.materials" />
              <label>覆盖位置（如 PA,PB,PF）</label>
              <input pInputText [(ngModel)]="form.positions" />
              <div class="two"><div><label>生效起</label><input pInputText [(ngModel)]="form.validFrom" /></div><div><label>有效期至</label><input pInputText [(ngModel)]="form.validUntil" /></div></div>
              <label class="check"><input type="checkbox" [(ngModel)]="form.saveFailed" /> 模拟本次保存失败（按证书号待重试，不排计划）</label>
              <div class="quick">
                <p-button label="同号冲突示例" size="small" severity="secondary" (onClick)="fillConflict()" />
                <p-button label="新证保存失败示例" size="small" severity="secondary" (onClick)="fillSaveFail()" />
              </div>
              <p-button label="提交证书" icon="pi pi-send" (onClick)="submitCert()" />
            </div>
            <p class="hint">同证书号：先到生效、后到挂“冲突”；保存失败挂“待重试”，点“按号重试续办”复用原记录，不重复落账、不重复排计划。</p>
          </div>
        </div>
      </section>
    </main>
  `,
  styles: [`
    .tabs{display:flex;gap:6px;padding:8px;margin-bottom:14px}
    .tabs button{border:0;background:transparent;padding:9px 14px;border-radius:6px;cursor:pointer;font-size:14px;color:#475467}
    .tabs button.active{background:#2563eb;color:#fff;font-weight:600}
    .notice{display:flex;gap:10px;align-items:center;border-left:4px solid #2563eb;margin-bottom:14px}
    .notice i{color:#2563eb}
    .blocked{background:#fff7f8}
    .returned{background:#fef2f2;color:#98a2b3}
    .conflict{background:#fef2f2}
    .isnew td{background:#eff6ff}
    .block{display:block;color:#7a8798;margin-top:3px}
    .muted{color:#98a2b3}
    .hint{margin:12px 2px 0;font-size:13px;color:#667085}
    .chip{display:inline-block;background:#eef2ff;color:#3949ab;border-radius:4px;padding:1px 7px;margin:1px 3px 1px 0;font-size:12px}
    .chip-overlap{display:inline-flex;flex-direction:column;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:5px;padding:2px 7px;margin:1px 4px 1px 0;font-size:12px;color:#475569}
    .chip-overlap small{font-size:10px;color:#94a3b8}
    .chip-overlap.chosen{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
    .chip-overlap.chosen small{color:#dbeafe}
    .chip-new{background:#dcfce7;color:#15803d;border-radius:4px;padding:1px 7px;font-size:11px;margin-left:6px}
    .gap{display:flex;flex-wrap:wrap;gap:4px}
    .tagmiss{display:inline-block;background:#fee2e2;color:#b91c1c;border-radius:4px;padding:1px 7px;font-size:11px;margin:1px 4px 1px 0}
    .form{display:grid;gap:7px}
    .form label{font-size:13px;color:#475467}
    .form select,.form input{padding:9px;border:1px solid #cbd5e1;border-radius:6px;width:100%}
    .form .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .form .check{display:flex;align-items:center;gap:8px}
    .form .check input{width:auto}
    .quick{display:flex;gap:8px}
  `],
})
export class ScopeLedgerComponent {
  private readonly store = inject(Store<{ scope: ScopeState }>)
  state!: ScopeState

  tab: Tab = 'ledger'
  selected = new Set<string>()

  form = {
    terminal: '录入端B' as '录入端A' | '录入端B',
    certificateNo: 'GW-2026-001',
    welder: '王凯',
    methods: 'GMAW',
    materials: 'Fe-I',
    positions: 'PF',
    validFrom: '2026-01-01',
    validUntil: '2028-01-01',
    saveFailed: false,
  }

  constructor() {
    this.store.select('scope').subscribe((state) => (this.state = state))
  }

  get ledger(): CoverageResult[] {
    return resolveLedger(this.state.welds, this.state.cards, this.state.certs)
  }

  get v2Published(): boolean {
    return this.state.cards.some((c) => c.cardNo === 'WPS-017' && c.version >= 2)
  }

  get wpsRows() {
    return [...this.state.cards]
      .sort((a, b) => a.cardNo.localeCompare(b.cardNo) || a.version - b.version)
      .map((c) => ({ ...c, key: `${c.cardNo}-${c.version}`, isNew: c.cardNo === 'WPS-017' && c.version === 2 }))
  }

  weld(id: string): ScopeWeld | undefined {
    return this.state.welds.find((w) => w.id === id)
  }

  certNo(id?: string): string {
    if (!id) return ''
    return this.state.certs.find((c) => c.id === id)?.certificateNo ?? id
  }

  countStage(stage: CoverageResult['stage']): number {
    return this.ledger.filter((r) => r.stage === stage).length
  }

  stageSeverity(stage: CoverageResult['stage']): 'success' | 'danger' | 'warn' {
    return stage === '可排入' ? 'success' : stage === '资质不覆盖' ? 'danger' : 'warn'
  }

  toggle(weldId: string) {
    if (this.selected.has(weldId)) this.selected.delete(weldId)
    else this.selected.add(weldId)
    this.selected = new Set(this.selected)
  }

  /** 排计划：引擎保证幂等——已有非退回计划行的焊缝不重复排 */
  doSchedule() {
    const outcome = scheduleEngine({
      welds: this.state.welds,
      cards: this.state.cards,
      certs: this.state.certs,
      existing: this.state.planLines,
      now: Date.now(),
    })
    this.store.dispatch(schedulePlans({ lines: outcome.lines, scheduled: outcome.scheduled, skipped: outcome.skipped }))
  }

  signSelected() {
    const ids = [...this.selected]
    const batchNo = `IP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 90 + 10)}`
    const signedAt = new Date().toLocaleString('zh-CN', { hour12: false })
    const lines = signEngine(this.state.planLines, ids, batchNo, signedAt)
    this.store.dispatch(signBatch({ weldIds: ids, batchNo, signedAt, lines }))
    this.selected = new Set()
  }

  /** 工艺卡更新：退回待执行计划，已签字保留 */
  publishV2() {
    const lines = returnForRecompute(this.state.planLines, 'WPS-017', 2, wps017V2.effectiveFrom)
    this.store.dispatch(publishWps({ card: wps017V2, lines }))
  }

  private split(text: string): string[] {
    return text.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  }

  submitCert() {
    const incoming = {
      id: `C-${Date.now()}`,
      certificateNo: this.form.certificateNo.trim(),
      welder: this.form.welder.trim(),
      methods: this.split(this.form.methods),
      materialGroups: this.split(this.form.materials),
      positions: this.split(this.form.positions),
      validFrom: this.form.validFrom,
      validUntil: this.form.validUntil,
      terminal: this.form.terminal,
      submittedAt: Date.now(),
    }
    const outcome = admitCertEngine(this.state.certs, incoming, this.form.saveFailed)
    const effective = this.state.certs.find((c) => c.certificateNo === incoming.certificateNo && c.status === '生效')
    const detail =
      outcome.result === '生效' ? `证书 ${incoming.certificateNo} 自 ${incoming.terminal} 提交，先到生效`
      : outcome.result === '续办生效' ? `证书 ${incoming.certificateNo} 按号重试续办成功，复用原记录（未重复落账、未重复排计划）`
      : outcome.result === '冲突' ? `证书 ${incoming.certificateNo} 与已生效证书 ${effective?.certificateNo ?? ''} 同号，后到留冲突，先到生效`
      : `证书 ${incoming.certificateNo} 保存失败，按证书号挂“待重试”，不排入计划`
    this.store.dispatch(admitCertificate({ certs: outcome.certs, result: outcome.result, certificateNo: incoming.certificateNo, detail }))
  }

  /** 对“待重试”记录按证书号续办：保存成功，复用同一条记录 */
  retry(cert: WelderCertificate) {
    const incoming = {
      id: cert.id,
      certificateNo: cert.certificateNo,
      welder: cert.welder,
      methods: cert.methods,
      materialGroups: cert.materialGroups,
      positions: cert.positions,
      validFrom: cert.validFrom,
      validUntil: cert.validUntil,
      terminal: cert.terminal,
      submittedAt: Date.now(),
    }
    const outcome = admitCertEngine(this.state.certs, incoming, false)
    this.store.dispatch(admitCertificate({
      certs: outcome.certs,
      result: outcome.result,
      certificateNo: cert.certificateNo,
      detail: `证书 ${cert.certificateNo} 按号重试续办成功，复用原“待重试”记录（未重复落账、未重复排计划）`,
    }))
  }

  fillConflict() {
    this.form = { ...this.form, terminal: '录入端B', certificateNo: 'GW-2026-001', welder: '王凯', methods: 'GMAW', materials: 'Fe-I', positions: 'PF', validFrom: '2026-01-01', validUntil: '2028-01-01', saveFailed: false }
  }

  fillSaveFail() {
    this.form = { ...this.form, terminal: '录入端A', certificateNo: 'GW-NEW-999', welder: '赵明', methods: 'FCAW', materials: 'Fe-III', positions: 'PE', validFrom: '2026-01-01', validUntil: '2028-12-31', saveFailed: true }
  }
}
