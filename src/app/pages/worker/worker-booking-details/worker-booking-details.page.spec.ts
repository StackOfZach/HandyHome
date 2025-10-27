import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkerBookingDetailsPage } from './worker-booking-details.page';

describe('WorkerBookingDetailsPage', () => {
  let component: WorkerBookingDetailsPage;
  let fixture: ComponentFixture<WorkerBookingDetailsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(WorkerBookingDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
