import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AdminDashboardPageRoutingModule } from './dashboard-routing.module';
import { AdminDashboardPage } from './dashboard.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    AdminDashboardPageRoutingModule,
  ],
  declarations: [AdminDashboardPage],
})
export class AdminDashboardPageModule {}
