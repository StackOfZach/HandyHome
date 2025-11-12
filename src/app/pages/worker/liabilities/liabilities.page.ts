import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonicModule,
  AlertController,
  ToastController,
  ModalController,
  LoadingController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import {
  LiabilitiesService,
  DailyLiability,
  PaymentSubmission,
} from '../../../services/liabilities';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-liabilities',
  templateUrl: './liabilities.page.html',
  styleUrls: ['./liabilities.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class LiabilitiesPage implements OnInit, OnDestroy {
  userProfile: UserProfile | null = null;
  workerProfile: WorkerProfile | null = null;

  dailyLiabilities: DailyLiability[] = [];
  todayLiability: number = 0;
  todayLiabilityStatus: 'pending' | 'paid' | 'overdue' = 'pending';
  totalPendingLiabilities: number = 0;

  isLoading = false;
  showGcashModal = false;
  showPaymentModal = false;
  selectedLiability: DailyLiability | null = null;

  // Payment form data
  referenceNumber: string = '';
  paymentProofImage: string = '';

  // GCash QR code from assets (replace with your actual GCash QR code)
  adminGcashQR: string = 'assets/gcash-qr-placeholder.jpg';

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private workerService: WorkerService,
    private liabilitiesService: LiabilitiesService,
    private alertController: AlertController,
    private toastController: ToastController,
    private modalController: ModalController,
    private loadingController: LoadingController
  ) {}

  async ngOnInit() {
    await this.loadUserProfile();
    await this.loadLiabilities();
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private async loadUserProfile() {
    try {
      this.userProfile = await this.authService.getCurrentUserProfile();
      if (this.userProfile) {
        this.workerProfile = await this.workerService.getWorkerProfile(
          this.userProfile.uid
        );
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  private async loadLiabilities() {
    if (!this.userProfile?.uid) return;

    this.isLoading = true;

    try {
      // Set up real-time subscription for liabilities
      const liabilitiesSubscription = this.liabilitiesService
        .getWorkerLiabilitiesObservable(this.userProfile.uid)
        .subscribe({
          next: (liabilities) => {
            this.dailyLiabilities = liabilities;
            this.totalPendingLiabilities = liabilities
              .filter((l) => l.status === 'pending' || l.status === 'overdue')
              .reduce((sum, l) => sum + l.totalLiability, 0);
            this.isLoading = false;
          },
          error: (error) => {
            console.error('Error loading liabilities:', error);
            this.showToast(
              'Error loading liabilities. Please try again.',
              'danger'
            );
            this.isLoading = false;
          },
        });

      this.subscriptions.push(liabilitiesSubscription);

      // Set up real-time subscription for today's liability with status
      const todayLiabilitySubscription = this.liabilitiesService
        .getTodayLiabilityWithStatusObservable(this.userProfile.uid)
        .subscribe({
          next: (todayData) => {
            this.todayLiability = todayData.amount;
            this.todayLiabilityStatus = todayData.status;
            console.log("📅 Today's liability updated:", {
              amount: todayData.amount,
              status: todayData.status,
            });
          },
          error: (error) => {
            console.error("Error loading today's liability:", error);
          },
        });

      this.subscriptions.push(todayLiabilitySubscription);
    } catch (error) {
      console.error('Error setting up liabilities subscription:', error);
      this.showToast('Error loading liabilities. Please try again.', 'danger');
      this.isLoading = false;
    }
  }

  async openPaymentModal(liability: DailyLiability) {
    this.selectedLiability = liability;
    this.showGcashModal = true;
  }

  closeGcashModal() {
    this.showGcashModal = false;
    this.selectedLiability = null;
  }

  async downloadQRCode() {
    try {
      // Create a temporary link to download the QR code
      const link = document.createElement('a');
      link.href = this.adminGcashQR;
      link.download = 'gcash-payment-qr.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      this.showToast('QR Code downloaded successfully!', 'success');
    } catch (error) {
      console.error('Error downloading QR code:', error);
      this.showToast('Error downloading QR code. Please try again.', 'danger');
    }
  }

  async confirmPayment() {
    this.showGcashModal = false;
    this.showPaymentModal = true;
  }

  async selectPaymentProof() {
    try {
      const alert = await this.alertController.create({
        header: 'Select Payment Proof',
        message: 'How would you like to provide your payment proof?',
        buttons: [
          {
            text: 'Take Photo',
            handler: () => this.takePhoto(),
          },
          {
            text: 'Choose from Gallery',
            handler: () => this.chooseFromGallery(),
          },
          {
            text: 'Cancel',
            role: 'cancel',
          },
        ],
      });

      await alert.present();
    } catch (error) {
      console.error('Error showing photo options:', error);
      this.showToast('Error opening camera options.', 'danger');
    }
  }

  private async takePhoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      this.paymentProofImage = image.dataUrl!;
    } catch (error) {
      console.error('Error taking photo:', error);
      this.showToast('Error taking photo. Please try again.', 'danger');
    }
  }

  private async chooseFromGallery() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });

      this.paymentProofImage = image.dataUrl!;
    } catch (error) {
      console.error('Error choosing from gallery:', error);
      this.showToast('Error selecting photo. Please try again.', 'danger');
    }
  }

  async submitPayment() {
    if (
      !this.selectedLiability ||
      !this.referenceNumber.trim() ||
      !this.paymentProofImage
    ) {
      this.showToast('Please fill in all required fields.', 'medium');
      return;
    }

    if (!this.userProfile || !this.workerProfile) {
      this.showToast('Unable to submit payment. Please try again.', 'danger');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Submitting payment...',
    });
    await loading.present();

    try {
      const submission: Omit<PaymentSubmission, 'submittedAt'> = {
        workerId: this.userProfile.uid,
        workerName: this.workerProfile.fullName,
        date: this.selectedLiability.date,
        amount: this.selectedLiability.totalLiability,
        referenceNumber: this.referenceNumber.trim(),
        paymentProofUrl: this.paymentProofImage,
        status: 'pending',
      };

      await this.liabilitiesService.submitPayment(submission);

      this.showToast(
        'Payment submitted successfully! Waiting for admin verification.',
        'success'
      );
      this.resetPaymentForm();
      await this.loadLiabilities(); // Refresh data
    } catch (error) {
      console.error('Error submitting payment:', error);
      this.showToast('Error submitting payment. Please try again.', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  private resetPaymentForm() {
    this.showPaymentModal = false;
    this.showGcashModal = false;
    this.selectedLiability = null;
    this.referenceNumber = '';
    this.paymentProofImage = '';
  }

  cancelPayment() {
    this.resetPaymentForm();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getModernStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'overdue':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  }

  getStatusDotColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'bg-amber-400 animate-pulse';
      case 'paid':
        return 'bg-emerald-500';
      case 'overdue':
        return 'bg-red-500 animate-pulse';
      default:
        return 'bg-gray-400';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'pending':
        return 'Pending Payment';
      case 'paid':
        return 'Payment Complete';
      case 'overdue':
        return 'Payment Overdue';
      default:
        return 'Unknown Status';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return 'time-outline';
      case 'paid':
        return 'checkmark-circle-outline';
      case 'overdue':
        return 'warning-outline';
      default:
        return 'help-circle-outline';
    }
  }

  trackByDate(index: number, liability: DailyLiability): string {
    return liability.date.toISOString();
  }

  getCurrentTime(): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  getCurrentDate(): Date {
    return new Date();
  }

  async goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }

  async showToast(message: string, color: 'success' | 'danger' | 'medium') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }

  async refreshData(event?: any) {
    await this.loadLiabilities();
    if (event) {
      event.target.complete();
    }
  }
}
