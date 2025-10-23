import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActiveBookingsPage } from './active-bookings.page';

describe('ActiveBookingsPage', () => {
  let component: ActiveBookingsPage;
  let fixture: ComponentFixture<ActiveBookingsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ActiveBookingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
