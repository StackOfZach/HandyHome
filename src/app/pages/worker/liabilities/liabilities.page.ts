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
  Platform,
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
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

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
    private loadingController: LoadingController,
    private platform: Platform
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
    const loading = await this.loadingController.create({
      message: 'Saving QR Code...',
    });
    await loading.present();

    try {
      if (Capacitor.isNativePlatform()) {
        // Mobile platform - save to photo gallery
        await this.saveQRToMobileGallery();
      } else {
        // Web platform - download as file
        await this.downloadQRForWeb();
      }

      await loading.dismiss();
      this.showToast('QR Code saved successfully!', 'success');
    } catch (error) {
      await loading.dismiss();
      console.error('Error saving QR code:', error);
      this.showToast('Error saving QR code. Please try again.', 'danger');
    }
  }

  private async saveQRToMobileGallery(): Promise<void> {
    try {
      // Convert the image URL to base64
      const base64Data = await this.convertImageToBase64(this.adminGcashQR);

      // Remove data URL prefix to get pure base64
      const base64String = base64Data.split(',')[1];

      // Generate filename with timestamp
      const fileName = `gcash-qr-${
        new Date().toISOString().split('T')[0]
      }-${Date.now()}.png`;

      if (this.platform.is('ios')) {
        // For iOS, save to Documents directory and then use share
        await this.saveToIOSGallery(base64String, fileName);
      } else if (this.platform.is('android')) {
        // For Android, save to Downloads directory
        await this.saveToAndroidGallery(base64String, fileName);
      } else {
        // Fallback to instructions
        await this.showInstructionsForManualSave();
      }
    } catch (error) {
      console.error('Error saving to mobile gallery:', error);
      // Fallback to manual save instructions
      await this.showInstructionsForManualSave();
    }
  }

  private async saveToIOSGallery(
    base64Data: string,
    fileName: string
  ): Promise<void> {
    try {
      // Save to app's documents directory first
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
      });

      // Show success message with instructions to move to Photos
      const alert = await this.alertController.create({
        header: 'QR Code Saved!',
        message: `
          <div style="text-align: center;">
            <p>✅ QR code has been saved to your device!</p>
            <br>
            <p style="font-size: 12px; color: #666;">
              You can find it in Files app > On My iPhone > HandyHome > Documents
            </p>
            <br>
            <p style="font-size: 12px;">
              To move to Photos: Open Files app → Long press the QR image → Share → Save to Photos
            </p>
          </div>
        `,
        buttons: ['OK'],
      });
      await alert.present();
    } catch (error) {
      console.error('Error saving to iOS:', error);
      throw error;
    }
  }

  private async saveToAndroidGallery(
    base64Data: string,
    fileName: string
  ): Promise<void> {
    try {
      // On Android, save to the Downloads directory
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents, // Changed from ExternalStorage as it needs permission
      });

      // Show success message
      const toast = await this.toastController.create({
        message: '✅ QR code saved to app documents folder!',
        duration: 3000,
        position: 'bottom',
        color: 'success',
        buttons: [
          {
            text: 'Open Folder',
            handler: () => {
              // Could implement file manager opening here
              this.showToast(
                'Check your file manager for the saved QR code',
                'medium'
              );
            },
          },
        ],
      });
      await toast.present();
    } catch (error) {
      console.error('Error saving to Android:', error);
      throw error;
    }
  }

  private async convertImageToBase64(imageUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot create canvas context'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
          const base64 = canvas.toDataURL('image/png');
          resolve(base64);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });
  }

  private async downloadQRForWeb(): Promise<void> {
    // Enhanced web download with better error handling
    try {
      const response = await fetch(this.adminGcashQR);
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gcash-payment-qr-${
        new Date().toISOString().split('T')[0]
      }.png`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up object URL
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading for web:', error);
      throw error;
    }
  }

  private async showInstructionsForManualSave(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Save QR Code',
      message: `
        <div style="text-align: center;">
          <p>To save the QR code to your gallery:</p>
          <ol style="text-align: left; margin: 10px 0;">
            <li>Long press on the QR code image</li>
            <li>Select "Save to Photos" or "Save Image"</li>
            <li>The QR code will be saved to your gallery</li>
          </ol>
          <p style="margin-top: 15px; font-size: 12px; color: #666;">
            <strong>Alternative:</strong> Take a screenshot of this screen
          </p>
        </div>
      `,
      buttons: [
        {
          text: 'Got it',
          role: 'cancel',
        },
        {
          text: 'Take Screenshot',
          handler: async () => {
            // Give user time to take screenshot
            const screenshotAlert = await this.alertController.create({
              header: 'Ready for Screenshot',
              message: 'The QR code is displayed below. Take a screenshot now.',
              buttons: ['Done'],
            });
            await screenshotAlert.present();
          },
        },
      ],
    });
    await alert.present();
  }

  async showQRSaveOptions() {
    const alert = await this.alertController.create({
      header: 'Save QR Code',
      subHeader: 'Choose how to save the QR code',
      buttons: [
        {
          text: 'Auto Save',
          handler: () => {
            this.downloadQRCode();
          },
        },
        {
          text: 'Share QR Code',
          handler: () => {
            this.shareQRCode();
          },
        },
        {
          text: 'Manual Save (Long Press)',
          handler: async () => {
            const instructionAlert = await this.alertController.create({
              header: 'Manual Save Instructions',
              message: `
                <div style="text-align: left;">
                  <p><strong>On Mobile:</strong></p>
                  <ol>
                    <li>Long press on the QR code image below</li>
                    <li>Select "Save Image" or "Save to Photos"</li>
                  </ol>
                  <br>
                  <p><strong>On Desktop:</strong></p>
                  <ol>
                    <li>Right-click on the QR code image</li>
                    <li>Select "Save image as..."</li>
                  </ol>
                </div>
              `,
              buttons: ['Got it'],
            });
            await instructionAlert.present();
          },
        },
        {
          text: 'Take Screenshot',
          handler: async () => {
            await this.showToast(
              'Take a screenshot now! The QR code is visible on screen.',
              'success'
            );
          },
        },
        {
          text: 'Cancel',
          role: 'cancel',
        },
      ],
    });
    await alert.present();
  }

  async shareQRCode() {
    try {
      if (Capacitor.isNativePlatform()) {
        // Use Web Share API or Capacitor Share if available
        const base64Data = await this.convertImageToBase64(this.adminGcashQR);

        // Create a blob and share it
        const response = await fetch(base64Data);
        const blob = await response.blob();
        const file = new File([blob], 'gcash-qr.png', { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'GCash Payment QR Code',
            text: 'QR Code for GCash payment',
            files: [file],
          });
        } else {
          // Fallback to manual save
          await this.showInstructionsForManualSave();
        }
      } else {
        // On web, download the file
        await this.downloadQRForWeb();
      }
    } catch (error) {
      console.error('Error sharing QR code:', error);
      this.showToast(
        'Sharing not available. Try the download option.',
        'medium'
      );
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
