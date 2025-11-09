import { TestBed } from '@angular/core/testing';

import { Liabilities } from './liabilities';

describe('Liabilities', () => {
  let service: Liabilities;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Liabilities);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
