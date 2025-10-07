import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { QuickBookingDetailsPage } from './quick-booking-details.page';

const routes: Routes = [
  {
    path: '',
    component: QuickBookingDetailsPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QuickBookingDetailsPageRoutingModule {}
