import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { QuickBookingsHistoryPageRoutingModule } from './quick-bookings-history-routing.module';

import { QuickBookingsHistoryPage } from './quick-bookings-history.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    QuickBookingsHistoryPageRoutingModule,
  ],
  declarations: [QuickBookingsHistoryPage],
})
export class QuickBookingsHistoryPageModule {}
