import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { QuickBookingHistoryPageRoutingModule } from './quick-booking-history-routing.module';

import { QuickBookingHistoryPage } from './quick-booking-history.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    QuickBookingHistoryPageRoutingModule
  ],
  declarations: [QuickBookingHistoryPage]
})
export class QuickBookingHistoryPageModule {}
