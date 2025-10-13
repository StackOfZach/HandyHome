import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { ScheduleBookingPageRoutingModule } from './schedule-booking-routing.module';
import { ScheduleBookingPage } from './schedule-booking.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ScheduleBookingPageRoutingModule
  ],
  declarations: [ScheduleBookingPage]
})
export class ScheduleBookingPageModule {}