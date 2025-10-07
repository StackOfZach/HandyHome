import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickBookingsHistoryPage } from './quick-bookings-history.page';

describe('QuickBookingsHistoryPage', () => {
  let component: QuickBookingsHistoryPage;
  let fixture: ComponentFixture<QuickBookingsHistoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(QuickBookingsHistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
