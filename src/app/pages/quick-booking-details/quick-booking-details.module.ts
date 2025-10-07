import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { QuickBookingDetailsPageRoutingModule } from './quick-booking-details-routing.module';
import { QuickBookingDetailsPage } from './quick-booking-details.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    QuickBookingDetailsPageRoutingModule,
  ],
  declarations: [QuickBookingDetailsPage],
})
export class QuickBookingDetailsPageModule {}
