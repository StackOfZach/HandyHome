import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { WorkerResultsPage } from './worker-results.page';

const routes: Routes = [
  {
    path: '',
    component: WorkerResultsPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WorkerResultsPageRoutingModule {}
