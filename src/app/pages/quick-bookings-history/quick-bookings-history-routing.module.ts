import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { QuickBookingsHistoryPage } from './quick-bookings-history.page';

const routes: Routes = [
  {
    path: '',
    component: QuickBookingsHistoryPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QuickBookingsHistoryPageRoutingModule {}
