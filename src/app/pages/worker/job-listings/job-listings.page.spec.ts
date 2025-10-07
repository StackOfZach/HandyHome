import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JobListingsPage } from './job-listings.page';

describe('JobListingsPage', () => {
  let component: JobListingsPage;
  let fixture: ComponentFixture<JobListingsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(JobListingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
