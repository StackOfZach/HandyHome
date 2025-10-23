import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ClientVerificationPageRoutingModule } from './client-verification-routing.module';
import { ClientVerificationPage } from './client-verification.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    ClientVerificationPageRoutingModule,
  ],
  declarations: [ClientVerificationPage],
})
export class ClientVerificationPageModule {}
