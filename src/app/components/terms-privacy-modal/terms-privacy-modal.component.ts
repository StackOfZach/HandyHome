import { Component, EventEmitter, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-terms-privacy-modal',
  templateUrl: './terms-privacy-modal.component.html',
  styleUrls: ['./terms-privacy-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class TermsPrivacyModalComponent {
  @Input() viewOnlyMode = false; // New input to control if buttons should be hidden
  @Output() agree = new EventEmitter<void>();
  @Output() disagree = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>(); // New output for view-only mode close

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

  onClose() {
    this.close.emit();
  }
}
