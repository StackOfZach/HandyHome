import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickBookingDetailsPage } from './quick-booking-details.page';

describe('QuickBookingDetailsPage', () => {
  let component: QuickBookingDetailsPage;
  let fixture: ComponentFixture<QuickBookingDetailsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(QuickBookingDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
