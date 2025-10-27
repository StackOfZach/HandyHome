import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../../../services/auth.service';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from '@angular/fire/firestore';
import { ToastController, LoadingController } from '@ionic/angular';

export interface WorkerQuickBookingData {
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
    transportFee?: number;
  };
  finalPricing?: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
    duration?: number;
  };
  estimatedDuration: number;
  jobTimer?: {
    startTime?: Date;
    endTime?: Date;
    duration?: number;
  };
  status: string;
  assignedWorker: string;
  clientName?: string;
  clientPhone?: string;
  rating?: number;
  review?: string;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

@Component({
  selector: 'app-quick-booking-history',
  templateUrl: './quick-booking-history.page.html',
  styleUrls: ['./quick-booking-history.page.scss'],
  standalone: false,
})
export class QuickBookingHistoryPage implements OnInit {
  userProfile: UserProfile | null = null;
  quickBookings: WorkerQuickBookingData[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid) {
        this.loadQuickBookingHistory();
      }
    });
  }

  async loadQuickBookingHistory() {
    if (!this.userProfile?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      console.log('Loading quick booking history for worker:', this.userProfile.uid);

      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const q = query(
        quickBookingsRef,
        where('assignedWorker', '==', this.userProfile.uid),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      this.quickBookings = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Convert Firestore Timestamps to Dates
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

        // Handle jobTimer data if present
        let jobTimer = undefined;
        if (data['jobTimer']) {
          const timerData = data['jobTimer'];
          jobTimer = {
            startTime: timerData.startTime instanceof Timestamp 
              ? timerData.startTime.toDate() 
              : timerData.startTime ? new Date(timerData.startTime) : undefined,
            endTime: timerData.endTime instanceof Timestamp 
              ? timerData.endTime.toDate() 
              : timerData.endTime ? new Date(timerData.endTime) : undefined,
            duration: timerData.duration || 0
          };
        }

        this.quickBookings.push({
          id: doc.id,
          ...data,
          createdAt,
          acceptedAt,
          completedAt,
          cancelledAt,
          jobTimer,
        } as WorkerQuickBookingData);
      });

      console.log(`Loaded ${this.quickBookings.length} quick bookings`);

      if (this.quickBookings.length === 0) {
        this.error = 'No quick booking history found.';
      }
    } catch (error) {
      console.error('Error loading quick booking history:', error);
      this.error = 'Failed to load quick booking history. Please try again.';
      this.showToast('Failed to load booking history', 'danger');
    } finally {
      this.isLoading = false;
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
    this.router.navigate(['/pages/worker/dashboard']);
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
      case 'payment-confirmed':
        return 'bg-emerald-100 text-emerald-800';
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
      case 'payment-confirmed':
        return 'card-outline';
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

  /**
   * Get the actual duration for a booking, preferring jobTimer.duration over estimatedDuration
   */
  getActualDuration(booking: WorkerQuickBookingData): number {
    if (booking.status === 'completed' || booking.status === 'payment-confirmed') {
      if (booking.jobTimer?.duration && booking.jobTimer.duration > 0) {
        return booking.jobTimer.duration;
      }
      if (booking.finalPricing?.duration && booking.finalPricing.duration > 0) {
        return booking.finalPricing.duration;
      }
    }
    return booking.estimatedDuration || 0;
  }

  /**
   * Get the final price for display, preferring finalPricing over initial pricing
   */
  getFinalPrice(booking: WorkerQuickBookingData): number {
    if (booking.status === 'completed' || booking.status === 'payment-confirmed') {
      if (booking.finalPricing?.total && booking.finalPricing.total > 0) {
        return booking.finalPricing.total;
      }
    }
    return booking.pricing?.total || 0;
  }

  /**
   * Check if booking has actual duration data
   */
  hasActualDuration(booking: WorkerQuickBookingData): boolean {
    return !!(booking.jobTimer?.duration && booking.jobTimer.duration > 0);
  }

  async viewBookingDetails(booking: WorkerQuickBookingData) {
    if (booking.id) {
      this.router.navigate(['/pages/worker/worker-booking-details'], {
        queryParams: { 
          bookingId: booking.id,
          type: 'quick'
        }
      });
    } else {
      this.showToast('Booking details not available', 'warning');
    }
  }

  getCompletedCount(): number {
    return this.quickBookings.filter(
      (booking) => booking.status === 'completed' || booking.status === 'payment-confirmed'
    ).length;
  }

  getCancelledCount(): number {
    return this.quickBookings.filter(
      (booking) => booking.status === 'cancelled'
    ).length;
  }

  getTotalEarnings(): number {
    return this.quickBookings
      .filter(booking => booking.status === 'completed' || booking.status === 'payment-confirmed')
      .reduce((total, booking) => total + this.getFinalPrice(booking), 0);
  }

  getAverageRating(): number {
    const ratedBookings = this.quickBookings.filter(booking => booking.rating && booking.rating > 0);
    if (ratedBookings.length === 0) return 0;
    
    const totalRating = ratedBookings.reduce((sum, booking) => sum + (booking.rating || 0), 0);
    return totalRating / ratedBookings.length;
  }
}
