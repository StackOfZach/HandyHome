import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BrowseWorkersPage } from './browse-workers.page';

const routes: Routes = [
  {
    path: '',
    component: BrowseWorkersPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BrowseWorkersPageRoutingModule {}