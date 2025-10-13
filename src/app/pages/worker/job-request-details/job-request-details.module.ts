import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { JobRequestDetailsPageRoutingModule } from './job-request-details-routing.module';

import { JobRequestDetailsPage } from './job-request-details.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    JobRequestDetailsPageRoutingModule
  ],
  declarations: [JobRequestDetailsPage]
})
export class JobRequestDetailsPageModule {}
