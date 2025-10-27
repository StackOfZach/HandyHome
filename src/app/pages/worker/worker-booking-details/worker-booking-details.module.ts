import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { WorkerBookingDetailsPageRoutingModule } from './worker-booking-details-routing.module';

import { WorkerBookingDetailsPage } from './worker-booking-details.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerBookingDetailsPageRoutingModule
  ],
  declarations: [WorkerBookingDetailsPage]
})
export class WorkerBookingDetailsPageModule {}
