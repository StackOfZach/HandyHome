import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkerFoundPage } from './worker-found.page';

describe('WorkerFoundPage', () => {
  let component: WorkerFoundPage;
  let fixture: ComponentFixture<WorkerFoundPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(WorkerFoundPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
