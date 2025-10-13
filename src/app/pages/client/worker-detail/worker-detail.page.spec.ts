import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkerDetailPage } from './worker-detail.page';

describe('WorkerDetailPage', () => {
  let component: WorkerDetailPage;
  let fixture: ComponentFixture<WorkerDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(WorkerDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});