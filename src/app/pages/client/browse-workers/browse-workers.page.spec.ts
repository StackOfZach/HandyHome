import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowseWorkersPage } from './browse-workers.page';

describe('BrowseWorkersPage', () => {
  let component: BrowseWorkersPage;
  let fixture: ComponentFixture<BrowseWorkersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BrowseWorkersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});