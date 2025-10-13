import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { WorkerDetailPage } from './worker-detail.page';

const routes: Routes = [
  {
    path: '',
    component: WorkerDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WorkerDetailPageRoutingModule {}