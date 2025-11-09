import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LiabilitiesPage } from './liabilities.page';

const routes: Routes = [
  {
    path: '',
    component: LiabilitiesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LiabilitiesPageRoutingModule {}
