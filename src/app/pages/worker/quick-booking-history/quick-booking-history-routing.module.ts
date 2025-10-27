import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { QuickBookingHistoryPage } from './quick-booking-history.page';

const routes: Routes = [
  {
    path: '',
    component: QuickBookingHistoryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QuickBookingHistoryPageRoutingModule {}
