import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { WorkerDashboardPageRoutingModule } from './dashboard-routing.module';
import { WorkerDashboardPage } from './dashboard.page';
import { JobDetailsModalComponent } from '../../../components/job-details-modal/job-details-modal.component';
import { TermsPrivacyModalComponent } from '../../../components/terms-privacy-modal/terms-privacy-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerDashboardPageRoutingModule,
    TermsPrivacyModalComponent, // Import the standalone component
  ],
  declarations: [WorkerDashboardPage, JobDetailsModalComponent],
})
export class WorkerDashboardPageModule {}
