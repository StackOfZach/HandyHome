import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { WorkerDashboardPageRoutingModule } from './dashboard-routing.module';
import { WorkerDashboardPage } from './dashboard.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkerDashboardPageRoutingModule,
  ],
  declarations: [WorkerDashboardPage],
})
export class WorkerDashboardPageModule {}
