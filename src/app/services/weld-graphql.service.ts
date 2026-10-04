import { inject, Injectable } from '@angular/core'
import { Apollo, gql } from 'apollo-angular'
import { map } from 'rxjs'
import type { CertificateConflict, FailedSave, InspectionPlan, ProcessCard, WelderCertificate, Weld } from '../types'

const WELDS_QUERY = gql`query Welds {
  welds { id drawing component joint method welder qualification qualificationValid inspectionRatio requiredRatio status x y repairs processCardNo workDate defects { id position type length level method report } }
  plans { id date method weldIds inspector state signed basis { weldId processCardNo processCardVersion method materialGroup position certificateNo certificateExpiry } }
  certificates { id welder methods materialGroups positions issueDate expiryDate terminal submittedAt }
  processCards { id version method materialGroup position effectiveFrom effectiveTo }
  conflicts { id certificateNo welder winnerTerminal loserTerminal winnerSubmittedAt loserSubmittedAt detail }
  failedSaves { certificateNo welder terminal reason failedAt retryCount certificate { id welder methods materialGroups positions issueDate expiryDate terminal submittedAt } }
}`

export interface ScopeData {
  welds: Weld[]
  plans: InspectionPlan[]
  certificates: WelderCertificate[]
  processCards: ProcessCard[]
  conflicts: CertificateConflict[]
  failedSaves: FailedSave[]
}

@Injectable({ providedIn: 'root' })
export class WeldGraphqlService {
  private readonly apollo = inject(Apollo)
  load() {
    return this.apollo.watchQuery<ScopeData>({ query: WELDS_QUERY, fetchPolicy: 'cache-first' }).valueChanges.pipe(map((result) => result.data))
  }
}
