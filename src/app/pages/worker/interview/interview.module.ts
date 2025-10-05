import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { InterviewPageRoutingModule } from './interview-routing.module';
import { InterviewPage } from './interview.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    InterviewPageRoutingModule,
    InterviewPage,
  ],
})
export class InterviewPageModule {}
