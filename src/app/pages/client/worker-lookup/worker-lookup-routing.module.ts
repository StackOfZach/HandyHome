import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { WorkerLookupPage } from './worker-lookup.page';

const routes: Routes = [
  {
    path: '',
    component: WorkerLookupPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WorkerLookupPageRoutingModule {}
