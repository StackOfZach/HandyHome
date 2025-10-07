import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SelectCategoryPage } from './select-category.page';

const routes: Routes = [
  {
    path: '',
    component: SelectCategoryPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SelectCategoryPageRoutingModule {}
