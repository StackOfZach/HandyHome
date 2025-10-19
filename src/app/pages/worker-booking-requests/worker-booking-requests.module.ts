import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { WorkerBookingRequestsPageRoutingModule } from './worker-booking-requests-routing.module';
import { WorkerBookingRequestsPage } from './worker-booking-requests.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerBookingRequestsPageRoutingModule,
  ],
  declarations: [WorkerBookingRequestsPage],
})
export class WorkerBookingRequestsPageModule {}
