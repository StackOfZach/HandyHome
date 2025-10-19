import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

// Components
import { MapPickerComponent } from '../components/map-picker/map-picker.component';
import { ReportWorkerModalComponent } from '../components/report-worker-modal/report-worker-modal.component';
import { PaymentModalComponent } from '../components/payment-modal/payment-modal.component';

@NgModule({
  declarations: [ReportWorkerModalComponent, PaymentModalComponent],
  imports: [
    CommonModule,
    IonicModule,
    ReactiveFormsModule,
    FormsModule,
    MapPickerComponent, // Import standalone component
  ],
  exports: [
    MapPickerComponent,
    ReportWorkerModalComponent,
    PaymentModalComponent,
  ],
})
export class SharedComponentsModule {}
