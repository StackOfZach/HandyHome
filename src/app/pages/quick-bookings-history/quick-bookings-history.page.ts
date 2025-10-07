import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../services/auth.service';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
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
  createdAt: Date;
  scheduledDate?: Date;
  scheduledTime?: string;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

@Component({
  selector: 'app-quick-bookings-history',
  templateUrl: './quick-bookings-history.page.html',
  styleUrls: ['./quick-bookings-history.page.scss'],
  standalone: false,
})
export class QuickBookingsHistoryPage implements OnInit {
  userProfile: UserProfile | null = null;
  quickBookings: QuickBookingData[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid) {
        this.loadQuickBookings();
      }
    });
  }

  async loadQuickBookings() {
    if (!this.userProfile?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Fetch quick bookings from Firestore
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const q = query(
        quickBookingsRef,
        where('clientId', '==', this.userProfile.uid),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      this.quickBookings = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Convert Firestore Timestamp to Date
        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

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

        this.quickBookings.push({
          id: doc.id,
          ...data,
          createdAt,
          completedAt,
          cancelledAt,
        } as QuickBookingData);
      });

      if (this.quickBookings.length === 0) {
        this.error = 'No quick bookings found. Start by using quick booking!';
      }
    } catch (error) {
      console.error('Error loading quick bookings:', error);
      this.error = 'Failed to load quick bookings. Please try again.';
      this.showToast('Failed to load quick bookings', 'danger');
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
    this.router.navigate(['/pages/client/dashboard']);
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

  async viewBookingDetails(booking: QuickBookingData) {
    if (booking.id) {
      this.router.navigate(['/pages/quick-booking-details', booking.id]);
    } else {
      this.showToast('Booking details not available', 'warning');
    }
  }

  async rebookService(booking: QuickBookingData) {
    // Navigate to quick booking with the same category
    this.router.navigate(['/client/select-category'], {
      queryParams: { type: 'quick', category: booking.categoryId },
    });
  }

  getCompletedCount(): number {
    return this.quickBookings.filter(
      (booking) => booking.status === 'completed'
    ).length;
  }

  getActiveCount(): number {
    return this.quickBookings.filter((booking) =>
      ['searching', 'accepted', 'on-the-way', 'in-progress'].includes(
        booking.status
      )
    ).length;
  }

  getCancelledCount(): number {
    return this.quickBookings.filter(
      (booking) => booking.status === 'cancelled'
    ).length;
  }
}
