import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { BookingProgressPageRoutingModule } from './booking-progress-routing.module';
import { BookingProgressPage } from './booking-progress.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BookingProgressPageRoutingModule,
  ],
  declarations: [BookingProgressPage],
})
export class BookingProgressPageModule {}
