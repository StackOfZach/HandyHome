import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { WorkerFoundPageRoutingModule } from './worker-found-routing.module';
import { WorkerFoundPage } from './worker-found.page';
import { MapComponent } from '../../../components/map/map.component';
import { SharedComponentsModule } from '../../../modules/shared-components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerFoundPageRoutingModule,
    MapComponent,
    SharedComponentsModule,
  ],
  declarations: [WorkerFoundPage],
})
export class WorkerFoundPageModule {}
