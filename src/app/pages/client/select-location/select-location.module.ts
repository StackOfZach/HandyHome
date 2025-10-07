import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SelectLocationPageRoutingModule } from './select-location-routing.module';

import { SelectLocationPage } from './select-location.page';
import { MapPickerComponent } from '../../../components/map-picker/map-picker.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SelectLocationPageRoutingModule,
    MapPickerComponent,
  ],
  declarations: [SelectLocationPage],
})
export class SelectLocationPageModule {}
