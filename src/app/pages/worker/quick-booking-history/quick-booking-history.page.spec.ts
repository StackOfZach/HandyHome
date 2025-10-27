import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickBookingHistoryPage } from './quick-booking-history.page';

describe('QuickBookingHistoryPage', () => {
  let component: QuickBookingHistoryPage;
  let fixture: ComponentFixture<QuickBookingHistoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(QuickBookingHistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
