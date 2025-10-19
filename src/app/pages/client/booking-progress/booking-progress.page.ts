import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import {
  Firestore,
  doc,
  onSnapshot,
  updateDoc,
  Unsubscribe,
} from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';

interface BookingData {
  id: string;
  clientId: string;
  workerId: string;
  workerName: string;
  workerPhone: string;
  neededService: string;
  scheduleDate: any;
  priceRange: number;
  minBudget?: number;
  maxBudget?: number;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt: any;
  updatedAt: any;
}

interface WorkerProfile {
  uid: string;
  fullName: string;
  photoUrl: string;
  rating: number;
  reviewCount: number;
  skills: string[];
  phoneNumber: string;
  verificationStatus: string;
}

@Component({
  selector: 'app-booking-progress',
  templateUrl: './booking-progress.page.html',
  styleUrls: ['./booking-progress.page.scss'],
  standalone: false,
})
export class BookingProgressPage implements OnInit, OnDestroy {
  booking: BookingData | null = null;
  worker: WorkerProfile | null = null;
  bookingId: string = '';
  currentUser: any = null;
  bookingSubscription: Unsubscribe | null = null;

  statusMessages = {
    pending: 'Waiting for worker to accept your booking...',
    accepted: 'Worker accepted your booking! Job is scheduled.',
    completed: 'Service completed successfully!',
    cancelled: 'Booking was cancelled.',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private modalController: ModalController,
    private toastController: ToastController,
    private firestore: Firestore,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();

    // Get booking ID from route params
    this.route.params.subscribe((params) => {
      this.bookingId = params['bookingId'];
      if (this.bookingId) {
        this.subscribeToBookingUpdates();
      }
    });
  }

  ngOnDestroy() {
    if (this.bookingSubscription) {
      this.bookingSubscription();
    }
  }

  subscribeToBookingUpdates() {
    const bookingDocRef = doc(this.firestore, 'bookings', this.bookingId);

    this.bookingSubscription = onSnapshot(
      bookingDocRef,
      (doc) => {
        if (doc.exists()) {
          this.booking = {
            id: doc.id,
            ...doc.data(),
          } as BookingData;

          // Load worker profile if not loaded
          if (this.booking.workerId && !this.worker) {
            this.loadWorkerProfile();
          }
        }
      },
      (error) => {
        console.error('Error listening to booking updates:', error);
      }
    );
  }

  async loadWorkerProfile() {
    if (!this.booking?.workerId) return;

    try {
      // In a real app, you'd fetch worker profile from Firestore
      // For now, we'll create a mock worker based on booking data
      this.worker = {
        uid: this.booking.workerId,
        fullName: this.booking.workerName || 'HandyHome Worker',
        photoUrl: '/assets/default-avatar.png',
        rating: 4.5, // Mock rating
        reviewCount: 23, // Mock review count
        skills: ['General Repair', 'Maintenance'], // Mock skills
        phoneNumber: this.booking.workerPhone || '',
        verificationStatus: 'verified',
      };
    } catch (error) {
      console.error('Error loading worker profile:', error);
    }
  }

  async sendMessage() {
    if (!this.worker || !this.booking) return;

    const message = `Hi ${this.worker.fullName}, I am ${
      this.currentUser?.displayName || 'a client'
    } from HandyHome. I've requested a booking for ${
      this.booking.neededService
    } scheduled on ${this.booking.scheduleDate
      ?.toDate()
      .toLocaleDateString()}.`;

    // Open SMS app with prefilled message
    const smsUrl = `sms:${this.worker.phoneNumber}?body=${encodeURIComponent(
      message
    )}`;
    window.open(smsUrl, '_system');
  }

  async sendSMS() {
    this.sendMessage();
  }

  async callWorker() {
    if (!this.worker) return;

    // Open phone dialer
    const telUrl = `tel:${this.worker.phoneNumber}`;
    window.open(telUrl, '_system');
  }

  goBack() {
    this.router.navigate(['/client/worker-results']);
  }

  getProgressPercentage(): number {
    if (!this.booking) return 0;

    switch (this.booking.status) {
      case 'pending':
        return 25;
      case 'accepted':
        return 75;
      case 'completed':
        return 100;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  }

  getCurrentStep(): string {
    if (!this.booking) return 'booking';

    switch (this.booking.status) {
      case 'pending':
        return 'matching';
      case 'accepted':
        return 'accepted';
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'booking';
      default:
        return 'booking';
    }
  }

  isStepCompleted(step: string): boolean {
    if (!this.booking) return false;

    const stepOrder = ['booking', 'matching', 'accepted', 'completed'];
    const currentIndex = stepOrder.indexOf(this.getCurrentStep());
    const stepIndex = stepOrder.indexOf(step);

    if (this.booking.status === 'cancelled') {
      return step === 'booking';
    }

    return (
      stepIndex <= currentIndex ||
      (this.booking.status === 'completed' && step !== 'completed') ||
      (this.booking.status === 'completed' && step === 'completed')
    );
  }

  async cancelBooking() {
    if (!this.booking || this.booking.status === 'accepted') return;

    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message:
        'Are you sure you want to cancel this booking? This action cannot be undone.',
      buttons: [
        {
          text: 'No, Keep Booking',
          role: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          handler: async () => {
            await this.confirmCancellation();
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmCancellation() {
    try {
      await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
        status: 'cancelled',
        updatedAt: new Date(),
        cancelledBy: 'client',
        cancelledAt: new Date(),
      });

      const toast = await this.toastController.create({
        message: 'Booking cancelled successfully.',
        duration: 3000,
        color: 'success',
      });
      toast.present();

      // Navigate back to client dashboard
      this.router.navigate(['/pages/client/dashboard']);
    } catch (error) {
      console.error('Error cancelling booking:', error);

      const toast = await this.toastController.create({
        message: 'Error cancelling booking. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  async reportWorker() {
    const alert = await this.alertController.create({
      header: 'Report Worker',
      message: 'What would you like to report about this worker?',
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          placeholder: 'Describe the issue...',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Submit Report',
          handler: (data) => {
            if (data.reason?.trim()) {
              this.submitReport(data.reason);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async submitReport(reason: string) {
    try {
      // In a real app, you'd save the report to Firestore
      console.log('Report submitted:', reason);

      const toast = await this.toastController.create({
        message: 'Report submitted successfully. We will review it shortly.',
        duration: 3000,
        color: 'success',
      });
      toast.present();
    } catch (error) {
      console.error('Error submitting report:', error);

      const toast = await this.toastController.create({
        message: 'Error submitting report. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  getStatusColor(): string {
    if (!this.booking) return 'medium';

    switch (this.booking.status) {
      case 'pending':
        return 'warning';
      case 'accepted':
        return 'success';
      case 'completed':
        return 'primary';
      case 'cancelled':
        return 'danger';
      default:
        return 'medium';
    }
  }

  getStatusIcon(): string {
    if (!this.booking) return '/assets/icons/time.svg';

    switch (this.booking.status) {
      case 'pending':
        return '/assets/icons/time.svg';
      case 'accepted':
        return '/assets/icons/checkmark-circle.svg';
      case 'completed':
        return '/assets/icons/completed.svg';
      case 'cancelled':
        return '/assets/icons/close-circle.svg';
      default:
        return '/assets/icons/time.svg';
    }
  }

  getStarRating(rating: number): string[] {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= rating ? 'star' : 'star-outline');
    }
    return stars;
  }

  getStatusMessage(): string {
    if (!this.booking?.status) return 'Loading...';
    return this.statusMessages[this.booking.status] || 'Unknown status';
  }

  getStatusDescription(): string {
    if (!this.booking?.status) return '';
    switch (this.booking.status) {
      case 'pending':
        return 'We will notify you when a worker accepts your booking';
      case 'accepted':
        return 'Your worker will contact you soon';
      case 'completed':
        return 'Thank you for using HandyHome!';
      default:
        return '';
    }
  }

  // Safe method to get formatted date string
  getFormattedDate(timestamp: any): string {
    try {
      if (!timestamp) {
        return 'Not scheduled';
      }
      
      // If it's a Firestore timestamp
      let date: Date;
      if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        date = new Date(timestamp);
      }
      
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      console.warn('Error formatting date:', error);
      return 'Invalid date';
    }
  }
}
