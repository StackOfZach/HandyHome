import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScheduleBookingPage } from './schedule-booking.page';

describe('ScheduleBookingPage', () => {
  let component: ScheduleBookingPage;
  let fixture: ComponentFixture<ScheduleBookingPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ScheduleBookingPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});