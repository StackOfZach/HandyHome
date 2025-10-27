import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  BookingService,
  BookingData,
  NewBookingData,
} from '../../../services/booking.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { PaymentService } from '../../../services/payment.service';
import { ReportService } from '../../../services/report.service';
import {
  LoadingController,
  ToastController,
  AlertController,
  ModalController,
} from '@ionic/angular';
import { ReportWorkerModalComponent } from '../../../components/report-worker-modal/report-worker-modal.component';
import { PaymentModalComponent } from '../../../components/payment-modal/payment-modal.component';

@Component({
  selector: 'app-booking-details',
  templateUrl: './booking-details.page.html',
  styleUrls: ['./booking-details.page.scss'],
  standalone: false,
})
export class BookingDetailsPage implements OnInit {
  bookingId: string = '';
  booking: BookingData | NewBookingData | null = null;
  worker: WorkerProfile | null = null;
  currentUser: UserProfile | null = null;
  isLoading = true;
  error: string | null = null;

  // Progress tracking stages
  progressStages = [
    { key: 'pending', label: 'Booking Submitted', icon: 'time-outline' },
    {
      key: 'accepted',
      label: 'Worker Assigned',
      icon: 'checkmark-circle-outline',
    },
    { key: 'on-the-way', label: 'Worker En Route', icon: 'car-outline' },
    { key: 'in-progress', label: 'Service Started', icon: 'construct-outline' },
    {
      key: 'completed',
      label: 'Service Completed',
      icon: 'checkmark-done-outline',
    },
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private bookingService: BookingService,
    private workerService: WorkerService,
    private authService: AuthService,
    private paymentService: PaymentService,
    private reportService: ReportService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    // Get booking ID from route parameters
    this.bookingId = this.route.snapshot.paramMap.get('id') || '';

    // Get current user
    this.authService.userProfile$.subscribe((profile) => {
      this.currentUser = profile;
    });

    if (this.bookingId) {
      await this.loadBookingDetails();
    } else {
      this.error = 'Invalid booking ID';
      this.isLoading = false;
    }
  }

  async loadBookingDetails() {
    if (!this.currentUser?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Get all user bookings and find the specific one
      const allBookings = await this.bookingService.getAllUserBookings(
        this.currentUser.uid
      );
      this.booking =
        allBookings.find((b) => (b as any).id === this.bookingId) || null;

      if (!this.booking) {
        this.error = 'Booking not found';
        return;
      }

      // Load worker details if booking is accepted and has a worker
      if (this.booking.status !== 'pending' && this.getWorkerIdFromBooking()) {
        await this.loadWorkerDetails();
      }
    } catch (error) {
      console.error('Error loading booking details:', error);
      this.error = 'Failed to load booking details';
      this.showToast('Failed to load booking details', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  async loadWorkerDetails() {
    const workerId = this.getWorkerIdFromBooking();
    if (!workerId) return;

    try {
      this.worker = await this.workerService.getCompleteWorkerProfile(workerId);
    } catch (error) {
      console.error('Error loading worker details:', error);
    }
  }

  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/pages/my-bookings']);
  }

  // Helper methods for different booking formats
  isNewBooking(
    booking: BookingData | NewBookingData
  ): booking is NewBookingData {
    return 'serviceName' in booking && 'workerName' in booking;
  }

  getBookingTitle(): string {
    if (!this.booking) return '';
    if (this.isNewBooking(this.booking)) {
      return this.booking.serviceName;
    }
    return (
      this.booking.title || this.booking.neededService || 'Service Request'
    );
  }

  getSpecificService(): string | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      // For new booking format, check for specificService field
      return this.booking.specificService || null;
    }
    // For old booking format, check for specificService field
    return this.booking.specificService || null;
  }

  getFullServiceTitle(): string {
    const mainService = this.getBookingTitle();
    const specificService = this.getSpecificService();
    
    if (mainService && specificService) {
      return `${mainService} - ${specificService}`;
    }
    
    return mainService;
  }

  getBookingWorkerName(): string | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      return this.booking.workerName;
    }
    return this.booking.workerName || null;
  }

  getWorkerIdFromBooking(): string | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      return this.booking.workerId;
    }
    return this.booking.workerId || null;
  }

  getBookingDate(): Date | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      return this.booking.date;
    }
    if (this.booking.schedule?.date) {
      return new Date(this.booking.schedule.date);
    }
    return null;
  }

  getBookingTime(): string | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      return this.booking.time;
    }
    return this.booking.schedule?.time || null;
  }

  getBookingAddress(): string | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      return this.booking.address;
    }
    return this.booking.locations?.[0]?.address || null;
  }

  getBookingPrice(): number {
    if (!this.booking) return 0;
    if (this.isNewBooking(this.booking)) {
      return this.booking.price;
    }
    return this.booking.total;
  }

  getBookingDescription(): string | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      return this.booking.notes || null;
    }
    return this.booking.description || this.booking.additionalDetails || null;
  }

  getBookingDuration(): number | null {
    if (!this.booking) return null;
    if (this.isNewBooking(this.booking)) {
      return this.booking.duration;
    }
    return null; // Old format doesn't have duration
  }

  // Progress tracking methods
  getCurrentStageIndex(): number {
    if (!this.booking) return 0;
    return this.progressStages.findIndex(
      (stage) => stage.key === this.booking!.status
    );
  }

  isStageCompleted(index: number): boolean {
    return index <= this.getCurrentStageIndex();
  }

  isStageActive(index: number): boolean {
    return index === this.getCurrentStageIndex();
  }

  getStageStatus(index: number): string {
    if (this.isStageActive(index)) return 'active';
    if (this.isStageCompleted(index)) return 'completed';
    return 'pending';
  }

  // Worker location (static for now, will be enhanced later)
  getWorkerLocation(): string | null {
    if (!this.worker || !this.booking || this.booking.status === 'pending') {
      return null;
    }

    // Static location based on worker's general area
    const workerArea = this.worker.fullAddress || 'Unknown location';

    switch (this.booking.status) {
      case 'accepted':
        return `Worker is preparing at ${workerArea}`;
      case 'on-the-way':
        return `Worker is traveling from ${workerArea} to your location`;
      case 'in-progress':
        return `Worker is at your service location`;
      case 'completed':
        return `Service completed at your location`;
      default:
        return null;
    }
  }

  async cancelBooking() {
    if (!this.booking) return;

    // Check cancellation policy first
    const cancellationCheck = await this.bookingService.canCancelBooking(
      this.bookingId
    );

    if (!cancellationCheck.canCancel) {
      await this.showToast(
        cancellationCheck.reason || 'Cannot cancel booking',
        'warning'
      );
      return;
    }

    // Show cancellation policy information
    let message = 'Are you sure you want to cancel this booking?';
    if (cancellationCheck.feeApplies) {
      message +=
        '\n\n⚠️ ' +
        (cancellationCheck.reason ||
          'Cancellation fees may apply based on our policy.');
    }

    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message: message,
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          placeholder: 'Reason for cancellation (optional)',
        },
      ],
      buttons: [
        {
          text: 'No',
          role: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          handler: async (data) => {
            try {
              const loading = await this.loadingController.create({
                message: 'Cancelling booking...',
              });
              await loading.present();

              await this.bookingService.cancelBooking(
                this.bookingId,
                data.reason
              );
              await this.loadBookingDetails(); // Refresh the booking
              this.showToast('Booking cancelled successfully', 'success');

              await loading.dismiss();
            } catch (error) {
              console.error('Error cancelling booking:', error);
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : 'Failed to cancel booking';
              this.showToast(errorMessage, 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  // Helper methods for safe property access
  getWorkerSkills(): string[] {
    return this.worker?.skills || [];
  }

  canShowCancelButton(): boolean {
    if (!this.booking) return false;

    // Show cancel button for bookings that are not completed, cancelled, or in-progress
    return (
      this.booking.status !== 'completed' &&
      this.booking.status !== 'cancelled' &&
      this.booking.status !== 'in-progress'
    );
  }

  hasWorkerSkills(): boolean {
    return this.getWorkerSkills().length > 0;
  }

  getDisplayedSkills(): string[] {
    return this.getWorkerSkills().slice(0, 4);
  }

  getRemainingSkillsCount(): number {
    const skills = this.getWorkerSkills();
    return Math.max(0, skills.length - 4);
  }

  async reportWorker() {
    if (!this.worker || !this.booking || !this.currentUser) {
      await this.showToast('Unable to report worker at this time', 'warning');
      return;
    }

    const modal = await this.modalController.create({
      component: ReportWorkerModalComponent,
      componentProps: {
        workerId: this.getWorkerIdFromBooking(),
        workerName: this.getBookingWorkerName() || 'Unknown Worker',
        bookingId: this.bookingId,
      },
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.success) {
      await this.showToast('Report submitted successfully', 'success');
    }
  }

  async processPayment() {
    if (!this.worker || !this.booking || !this.currentUser) {
      await this.showToast('Unable to process payment at this time', 'warning');
      return;
    }

    // Check if payment can be processed
    const canPay = await this.paymentService.canProcessPayment(this.bookingId);
    if (!canPay.canPay) {
      await this.showToast(
        canPay.reason || 'Cannot process payment',
        'warning'
      );
      return;
    }

    // Get amount from booking data structure
    const amount =
      'total' in this.booking ? this.booking.total : this.booking.price;
    const serviceCharge =
      'serviceCharge' in this.booking ? this.booking.serviceCharge : 0;
    const transportFee =
      'transportFee' in this.booking ? this.booking.transportFee : 0;
    const basePrice = amount - serviceCharge - transportFee;

    const modal = await this.modalController.create({
      component: PaymentModalComponent,
      componentProps: {
        bookingId: this.bookingId,
        workerId: this.getWorkerIdFromBooking(),
        workerName: this.getBookingWorkerName() || 'Unknown Worker',
        amount: amount,
        breakdown: {
          basePrice: basePrice,
          serviceCharge: serviceCharge,
          transportFee: transportFee,
        },
      },
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.success) {
      await this.showToast('Payment completed successfully!', 'success');
      // Refresh booking data to show payment status
      this.loadBookingDetails();
    }
  }
}
