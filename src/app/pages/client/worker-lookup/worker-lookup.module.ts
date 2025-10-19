import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { WorkerLookupPageRoutingModule } from './worker-lookup-routing.module';
import { WorkerLookupPage } from './worker-lookup.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerLookupPageRoutingModule,
  ],
  declarations: [WorkerLookupPage],
})
export class WorkerLookupPageModule {}
