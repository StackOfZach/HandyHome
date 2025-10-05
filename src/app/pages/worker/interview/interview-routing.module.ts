import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InterviewPage } from './interview.page';

const routes: Routes = [
  {
    path: '',
    component: InterviewPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InterviewPageRoutingModule {}
