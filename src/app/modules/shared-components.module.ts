import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

// Components
import { MapPickerComponent } from '../components/map-picker/map-picker.component';

@NgModule({
  declarations: [MapPickerComponent],
  imports: [CommonModule, IonicModule],
  exports: [MapPickerComponent],
})
export class SharedComponentsModule {}
