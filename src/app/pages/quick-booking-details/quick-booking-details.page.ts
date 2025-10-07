import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
  ModalController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../services/auth.service';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from '@angular/fire/firestore';

export interface QuickBookingData {
  id?: string;
  clientId: string;
  categoryId: string;
  categoryName: string;
  subService: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    city?: string;
    province?: string;
  };
  pricing: {
    basePrice: number;
    serviceCharge: number;
    total: number;
  };
  estimatedDuration: number;
  status:
    | 'searching'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled';
  assignedWorker: string | null;
  workerName?: string;
  workerPhone?: string;
  workerRating?: number;
  createdAt: Date;
  scheduledDate?: Date;
  scheduledTime?: string;
  acceptedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  clientRating?: number;
  clientReview?: string;
  reviewedAt?: Date;
}

export interface WorkerProfile {
  id: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  profilePicture?: string;
  rating: number;
  totalJobs: number;
  completedJobs: number;
  skills: string[];
  bio?: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  joinedDate: Date;
}

@Component({
  selector: 'app-quick-booking-details',
  templateUrl: './quick-booking-details.page.html',
  styleUrls: ['./quick-booking-details.page.scss'],
  standalone: false,
})
export class QuickBookingDetailsPage implements OnInit {
  bookingId: string = '';
  booking: QuickBookingData | null = null;
  workerProfile: WorkerProfile | null = null;
  userProfile: UserProfile | null = null;
  isLoading = true;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private modalController: ModalController
  ) {}

  ngOnInit() {
    this.bookingId = this.route.snapshot.paramMap.get('id') || '';

    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid && this.bookingId) {
        this.loadBookingDetails();
      }
    });
  }

  async loadBookingDetails() {
    if (!this.bookingId) {
      this.error = 'No booking ID provided';
      this.isLoading = false;
      return;
    }

    try {
      this.isLoading = true;
      this.error = null;

      // Fetch booking details
      const bookingRef = doc(this.firestore, 'quickbookings', this.bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (!bookingSnap.exists()) {
        this.error = 'Booking not found';
        return;
      }

      const data = bookingSnap.data();

      // Convert Firestore Timestamp to Date
      const createdAt =
        data['createdAt'] instanceof Timestamp
          ? data['createdAt'].toDate()
          : new Date(data['createdAt']);

      const acceptedAt =
        data['acceptedAt'] instanceof Timestamp
          ? data['acceptedAt'].toDate()
          : data['acceptedAt']
          ? new Date(data['acceptedAt'])
          : undefined;

      const startedAt =
        data['startedAt'] instanceof Timestamp
          ? data['startedAt'].toDate()
          : data['startedAt']
          ? new Date(data['startedAt'])
          : undefined;

      const completedAt =
        data['completedAt'] instanceof Timestamp
          ? data['completedAt'].toDate()
          : data['completedAt']
          ? new Date(data['completedAt'])
          : undefined;

      const cancelledAt =
        data['cancelledAt'] instanceof Timestamp
          ? data['cancelledAt'].toDate()
          : data['cancelledAt']
          ? new Date(data['cancelledAt'])
          : undefined;

      const reviewedAt =
        data['reviewedAt'] instanceof Timestamp
          ? data['reviewedAt'].toDate()
          : data['reviewedAt']
          ? new Date(data['reviewedAt'])
          : undefined;

      this.booking = {
        id: bookingSnap.id,
        ...data,
        createdAt,
        acceptedAt,
        startedAt,
        completedAt,
        cancelledAt,
        reviewedAt,
      } as QuickBookingData;

      // Verify booking belongs to current user
      if (this.booking.clientId !== this.userProfile?.uid) {
        this.error = 'Access denied';
        return;
      }

      // Load worker profile if assigned
      if (this.booking.assignedWorker) {
        await this.loadWorkerProfile(this.booking.assignedWorker);
      }
    } catch (error) {
      console.error('Error loading booking details:', error);
      this.error = 'Failed to load booking details';
      this.showToast('Failed to load booking details', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  async loadWorkerProfile(workerId: string) {
    try {
      const workerRef = doc(this.firestore, 'workers', workerId);
      const workerSnap = await getDoc(workerRef);

      if (workerSnap.exists()) {
        const data = workerSnap.data();
        const joinedDate =
          data['joinedDate'] instanceof Timestamp
            ? data['joinedDate'].toDate()
            : new Date(data['joinedDate']);

        this.workerProfile = {
          id: workerSnap.id,
          ...data,
          joinedDate,
        } as WorkerProfile;
      }
    } catch (error) {
      console.error('Error loading worker profile:', error);
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
    this.router.navigate(['/pages/quick-bookings-history']);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'searching':
        return 'bg-blue-100 text-blue-800';
      case 'accepted':
        return 'bg-indigo-100 text-indigo-800';
      case 'on-the-way':
        return 'bg-purple-100 text-purple-800';
      case 'in-progress':
        return 'bg-orange-100 text-orange-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'searching':
        return 'search-outline';
      case 'accepted':
        return 'checkmark-circle-outline';
      case 'on-the-way':
        return 'car-outline';
      case 'in-progress':
        return 'build-outline';
      case 'completed':
        return 'checkmark-done-outline';
      case 'cancelled':
        return 'close-circle-outline';
      default:
        return 'help-circle-outline';
    }
  }

  getCategoryIcon(categoryId: string): string {
    switch (categoryId) {
      case 'cleaning':
        return 'brush-outline';
      case 'plumbing':
        return 'water-outline';
      case 'electrical':
        return 'flash-outline';
      case 'gardening':
        return 'leaf-outline';
      case 'carpentry':
        return 'hammer-outline';
      case 'painting':
        return 'color-palette-outline';
      case 'appliance':
        return 'settings-outline';
      default:
        return 'construct-outline';
    }
  }

  getCategoryColor(categoryId: string): string {
    switch (categoryId) {
      case 'cleaning':
        return 'bg-blue-100 text-blue-600';
      case 'plumbing':
        return 'bg-indigo-100 text-indigo-600';
      case 'electrical':
        return 'bg-yellow-100 text-yellow-600';
      case 'gardening':
        return 'bg-green-100 text-green-600';
      case 'carpentry':
        return 'bg-amber-100 text-amber-600';
      case 'painting':
        return 'bg-purple-100 text-purple-600';
      case 'appliance':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  }

  formatCurrency(amount: number): string {
    return `₱${amount.toLocaleString()}`;
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  async rebookService() {
    if (!this.booking) return;

    // Navigate to quick booking with the same category
    this.router.navigate(['/client/select-category'], {
      queryParams: { type: 'quick', category: this.booking.categoryId },
    });
  }

  async contactWorker() {
    if (!this.workerProfile || !this.workerProfile.phoneNumber) {
      this.showToast('Worker contact information not available', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Contact Worker',
      message: `Call ${this.workerProfile.fullName}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Call',
          handler: () => {
            window.open(`tel:${this.workerProfile?.phoneNumber}`);
          },
        },
      ],
    });

    await alert.present();
  }

  async rateService() {
    if (!this.booking || this.booking.status !== 'completed') {
      this.showToast('Service must be completed to rate', 'warning');
      return;
    }

    if (this.booking.clientRating) {
      this.showToast('You have already rated this service', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Rate Service',
      message: 'How would you rate this service?',
      inputs: [
        {
          name: 'rating',
          type: 'number',
          placeholder: 'Rating (1-5)',
          min: 1,
          max: 5,
        },
        {
          name: 'review',
          type: 'textarea',
          placeholder: 'Optional review...',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Submit',
          handler: async (data) => {
            if (data.rating && data.rating >= 1 && data.rating <= 5) {
              await this.submitRating(parseInt(data.rating), data.review || '');
            } else {
              this.showToast('Please provide a valid rating (1-5)', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async submitRating(rating: number, review: string) {
    if (!this.booking) return;

    try {
      const loading = await this.loadingController.create({
        message: 'Submitting rating...',
      });
      await loading.present();

      const bookingRef = doc(this.firestore, 'quickbookings', this.bookingId);
      await updateDoc(bookingRef, {
        clientRating: rating,
        clientReview: review,
        reviewedAt: new Date(),
      });

      // Update local booking data
      this.booking.clientRating = rating;
      this.booking.clientReview = review;
      this.booking.reviewedAt = new Date();

      await loading.dismiss();
      this.showToast('Rating submitted successfully!', 'success');
    } catch (error) {
      console.error('Error submitting rating:', error);
      this.showToast('Failed to submit rating', 'danger');
    }
  }

  async cancelBooking() {
    if (
      !this.booking ||
      this.booking.status === 'completed' ||
      this.booking.status === 'cancelled'
    ) {
      this.showToast('Cannot cancel this booking', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking?',
      inputs: [
        {
          name: 'reason',
          type: 'text',
          placeholder: 'Cancellation reason (optional)',
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
            await this.performCancellation(
              data.reason || 'Cancelled by client'
            );
          },
        },
      ],
    });

    await alert.present();
  }

  async performCancellation(reason: string) {
    if (!this.booking) return;

    try {
      const loading = await this.loadingController.create({
        message: 'Cancelling booking...',
      });
      await loading.present();

      const bookingRef = doc(this.firestore, 'quickbookings', this.bookingId);
      await updateDoc(bookingRef, {
        status: 'cancelled',
        cancellationReason: reason,
        cancelledAt: new Date(),
      });

      // Update local booking data
      this.booking.status = 'cancelled';
      this.booking.cancellationReason = reason;
      this.booking.cancelledAt = new Date();

      await loading.dismiss();
      this.showToast('Booking cancelled successfully', 'success');
    } catch (error) {
      console.error('Error cancelling booking:', error);
      this.showToast('Failed to cancel booking', 'danger');
    }
  }

  canCancelBooking(): boolean {
    return (
      this.booking?.status === 'searching' ||
      this.booking?.status === 'accepted'
    );
  }

  canContactWorker(): boolean {
    return !!(
      this.workerProfile?.phoneNumber &&
      this.booking?.status !== 'cancelled' &&
      this.booking?.status !== 'searching'
    );
  }

  canRateService(): boolean {
    return this.booking?.status === 'completed' && !this.booking?.clientRating;
  }

  getJobProgress(): number {
    if (!this.booking) return 0;

    switch (this.booking.status) {
      case 'searching':
        return 20;
      case 'accepted':
        return 40;
      case 'on-the-way':
        return 60;
      case 'in-progress':
        return 80;
      case 'completed':
        return 100;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  }

  getJobProgressText(): string {
    if (!this.booking) return '';

    switch (this.booking.status) {
      case 'searching':
        return 'Searching for worker...';
      case 'accepted':
        return 'Worker assigned and confirmed';
      case 'on-the-way':
        return 'Worker is on the way';
      case 'in-progress':
        return 'Service in progress';
      case 'completed':
        return 'Service completed successfully!';
      case 'cancelled':
        return 'Booking was cancelled';
      default:
        return 'Unknown status';
    }
  }
}
