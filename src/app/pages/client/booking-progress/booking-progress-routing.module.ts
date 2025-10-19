import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { BookingProgressPage } from './booking-progress.page';

const routes: Routes = [
  {
    path: '',
    component: BookingProgressPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BookingProgressPageRoutingModule {}
