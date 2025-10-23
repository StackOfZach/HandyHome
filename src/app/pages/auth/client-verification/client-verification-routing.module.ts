import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ClientVerificationPage } from './client-verification.page';

const routes: Routes = [
  {
    path: '',
    component: ClientVerificationPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ClientVerificationPageRoutingModule {}
