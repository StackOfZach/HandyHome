import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { WorkerBookingDetailsPage } from './worker-booking-details.page';

const routes: Routes = [
  {
    path: '',
    component: WorkerBookingDetailsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WorkerBookingDetailsPageRoutingModule {}
