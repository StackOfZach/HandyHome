import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { WorkerDashboardPageRoutingModule } from './dashboard-routing.module';
import { WorkerDashboardPage } from './dashboard.page';
import { JobDetailsModalComponent } from '../../../components/job-details-modal/job-details-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerDashboardPageRoutingModule,
  ],
  declarations: [WorkerDashboardPage, JobDetailsModalComponent],
})
export class WorkerDashboardPageModule {}
