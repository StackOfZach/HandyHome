import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-terms-privacy-modal',
  templateUrl: './terms-privacy-modal.component.html',
  styleUrls: ['./terms-privacy-modal.component.scss'],
  standalone: false,
})
export class TermsPrivacyModalComponent {
  @Output() agree = new EventEmitter<void>();
  @Output() disagree = new EventEmitter<void>();

  currentTab: 'terms' | 'privacy' = 'terms';

  constructor() {}

  switchTab(tab: 'terms' | 'privacy') {
    this.currentTab = tab;
  }

  onAgree() {
    this.agree.emit();
  }

  onDisagree() {
    this.disagree.emit();
  }
}
