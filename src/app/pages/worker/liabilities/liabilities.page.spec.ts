import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiabilitiesPage } from './liabilities.page';

describe('LiabilitiesPage', () => {
  let component: LiabilitiesPage;
  let fixture: ComponentFixture<LiabilitiesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LiabilitiesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
