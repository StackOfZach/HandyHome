import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AdminDashboardPageRoutingModule } from './dashboard-routing.module';
import { AdminDashboardPage } from './dashboard.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AdminDashboardPageRoutingModule,
  ],
  declarations: [AdminDashboardPage],
})
export class AdminDashboardPageModule {}
