import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ScheduleBookingPage } from './schedule-booking.page';

const routes: Routes = [
  {
    path: '',
    component: ScheduleBookingPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ScheduleBookingPageRoutingModule {}