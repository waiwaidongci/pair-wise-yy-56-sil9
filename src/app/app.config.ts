import { ApplicationConfig } from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideStore } from '@ngrx/store'
import { providePrimeNG } from 'primeng/config'
import Aura from '@primeng/themes/aura'
import { provideApollo } from 'apollo-angular'
import { ApolloLink, InMemoryCache, Observable } from '@apollo/client/core'
import { routes } from './app.routes'
import { weldReducer } from './store/weld.reducer'
import { mockCertificates, mockConflicts, mockFailedSaves, mockPlans, mockProcessCards, mockWelds } from './mock-data'

const mockGraphqlLink = new ApolloLink((operation) => new Observable((observer) => {
  setTimeout(() => {
    if (operation.operationName === 'Welds') {
      observer.next({ data: {
        welds: mockWelds,
        plans: mockPlans,
        certificates: mockCertificates,
        processCards: mockProcessCards,
        conflicts: mockConflicts,
        failedSaves: mockFailedSaves,
      } })
    } else {
      observer.next({ data: {} })
    }
    observer.complete()
  }, 180)
}))

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideStore({ welds: weldReducer }),
    providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: false } } }),
    provideApollo(() => ({ cache: new InMemoryCache(), link: mockGraphqlLink })),
  ],
}
