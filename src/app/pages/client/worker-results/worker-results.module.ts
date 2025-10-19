import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { WorkerResultsPageRoutingModule } from './worker-results-routing.module';
import { WorkerResultsPage } from './worker-results.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerResultsPageRoutingModule,
  ],
  declarations: [WorkerResultsPage],
})
export class WorkerResultsPageModule {}
