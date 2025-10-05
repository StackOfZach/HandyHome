import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { BookServicePageRoutingModule } from './book-service-routing.module';
import { BookServicePage } from './book-service.page';
import { MapComponent } from '../../components/map/map.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    BookServicePageRoutingModule,
    MapComponent, // Standalone component
  ],
  declarations: [BookServicePage],
})
export class BookServicePageModule {}
