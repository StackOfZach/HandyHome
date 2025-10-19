import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ClientDashboardPageRoutingModule } from './dashboard-routing.module';
import { ClientDashboardPage } from './dashboard.page';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ClientDashboardPageRoutingModule,
  ],
  declarations: [ClientDashboardPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ClientDashboardPageModule {}
