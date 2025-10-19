import { Component, OnInit } from '@angular/core';
import {
  ModalController,
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { PaymentService, PaymentData } from '../../services/payment.service';
import { AuthService, UserProfile } from '../../services/auth.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-payment-modal',
  templateUrl: './payment-modal.component.html',
  styleUrls: ['./payment-modal.component.scss'],
  standalone: false,
})
export class PaymentModalComponent implements OnInit {
  bookingId: string = '';
  workerId: string = '';
  workerName: string = '';
  amount: number = 0;
  breakdown: PaymentData['breakdown'] = {
    basePrice: 0,
    serviceCharge: 0,
    transportFee: 0,
  };

  currentUser: UserProfile | null = null;
  currentStep = 1;
  maxSteps = 3;

  // Make Math available in template
  Math = Math;

  // Payment verification
  verificationMethod: 'photo' | 'signature' | 'otp' = 'photo';
  verificationData: {
    photoUrl?: string;
    signatureData?: string;
    otpCode?: string;
  } = {};

  // Form data
  paymentForm = {
    notes: '',
    tipAmount: 0,
    addTip: false,
  };

  isProcessing = false;
  paymentId: string = '';

  constructor(
    private modalController: ModalController,
    private paymentService: PaymentService,
    private authService: AuthService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    // Get current user
    this.authService.userProfile$.subscribe((profile) => {
      this.currentUser = profile;
    });
  }

  dismiss() {
    this.modalController.dismiss();
  }

  nextStep() {
    if (this.currentStep < this.maxSteps) {
      this.currentStep++;
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  get totalAmount(): number {
    const baseTotal =
      this.breakdown.basePrice +
      this.breakdown.serviceCharge +
      (this.breakdown.transportFee || 0);
    return (
      baseTotal + (this.paymentForm.addTip ? this.paymentForm.tipAmount : 0)
    );
  }

  setVerificationMethod(method: 'photo' | 'signature' | 'otp') {
    this.verificationMethod = method;
  }

  async capturePaymentProof() {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (image.dataUrl) {
        this.verificationData.photoUrl = image.dataUrl;
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      await this.showToast('Unable to capture photo', 'danger');
    }
  }

  async selectFromGallery() {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });

      if (image.dataUrl) {
        this.verificationData.photoUrl = image.dataUrl;
      }
    } catch (error) {
      console.error('Error selecting photo:', error);
      await this.showToast('Unable to select photo', 'danger');
    }
  }

  removePhoto() {
    this.verificationData.photoUrl = undefined;
  }

  generateOTP() {
    // Generate a simple 6-digit OTP for demonstration
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.verificationData.otpCode = otp;
  }

  canProceedStep1(): boolean {
    return true; // Payment details are always available
  }

  canProceedStep2(): boolean {
    switch (this.verificationMethod) {
      case 'photo':
        return !!this.verificationData.photoUrl;
      case 'signature':
        return !!this.verificationData.signatureData;
      case 'otp':
        return !!this.verificationData.otpCode;
      default:
        return false;
    }
  }

  async processPayment() {
    if (!this.currentUser) {
      await this.showToast('User information not available', 'danger');
      return;
    }

    // Check payment prerequisites
    const canPay = await this.paymentService.canProcessPayment(this.bookingId);
    if (!canPay.canPay) {
      await this.showToast(
        canPay.reason || 'Cannot process payment',
        'warning'
      );
      return;
    }

    this.isProcessing = true;
    const loading = await this.loadingController.create({
      message: 'Processing payment...',
    });
    await loading.present();

    try {
      // Calculate final amount with tip
      const finalBreakdown = { ...this.breakdown };
      const finalAmount = this.totalAmount;

      // Initialize payment
      const paymentData: Omit<
        PaymentData,
        'id' | 'receiptNumber' | 'initiatedAt' | 'receiptGenerated'
      > = {
        bookingId: this.bookingId,
        clientId: this.currentUser.uid,
        workerId: this.workerId,
        workerName: this.workerName,
        clientName: this.currentUser.fullName || 'Unknown',
        amount: finalAmount,
        breakdown: finalBreakdown,
        paymentMethod: 'cash_on_service',
        status: 'pending',
        paymentType: 'full',
        verificationMethod: this.verificationMethod,
        notes: this.paymentForm.notes,
      };

      this.paymentId = await this.paymentService.initializePayment(paymentData);

      // Complete payment with verification data
      await this.paymentService.completePayment(
        this.paymentId,
        {
          ...this.verificationData,
          verifiedAt: new Date(),
        },
        'Payment completed via mobile app'
      );

      await this.showToast('Payment completed successfully!', 'success');

      // Close modal and return success
      this.modalController.dismiss({
        success: true,
        paymentId: this.paymentId,
      });
    } catch (error) {
      console.error('Error processing payment:', error);
      await this.showToast(
        'Failed to process payment. Please try again.',
        'danger'
      );
    } finally {
      this.isProcessing = false;
      await loading.dismiss();
    }
  }

  async showPaymentConfirmation() {
    const alert = await this.alertController.create({
      header: 'Confirm Payment',
      message: `Are you sure you want to process payment of ₱${this.totalAmount.toFixed(
        2
      )} for this service?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Confirm Payment',
          handler: () => {
            this.processPayment();
          },
        },
      ],
    });

    await alert.present();
  }

  canProceed(): boolean {
    switch (this.currentStep) {
      case 1:
        return this.canProceedStep1();
      case 2:
        return this.canProceedStep2();
      case 3:
        return true;
      default:
        return false;
    }
  }

  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
