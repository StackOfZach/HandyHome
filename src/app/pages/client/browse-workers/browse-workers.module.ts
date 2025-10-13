import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { BrowseWorkersPageRoutingModule } from './browse-workers-routing.module';
import { BrowseWorkersPage } from './browse-workers.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    BrowseWorkersPageRoutingModule
  ],
  declarations: [BrowseWorkersPage]
})
export class BrowseWorkersPageModule {}