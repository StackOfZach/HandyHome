import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JobRequestDetailsPage } from './job-request-details.page';

describe('JobRequestDetailsPage', () => {
  let component: JobRequestDetailsPage;
  let fixture: ComponentFixture<JobRequestDetailsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(JobRequestDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
