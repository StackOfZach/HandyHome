import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  Timestamp,
} from '@angular/fire/firestore';
import { ToastController } from '@ionic/angular';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { Subscription } from 'rxjs';

interface ActiveBooking {
  id: string;
  clientName?: string;
  clientUid?: string;
  neededService?: string;
  categoryName?: string;
  subService?: string;
  scheduleDate?: Timestamp;
  status: string;
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
  };
  minBudget?: number;
  maxBudget?: number;
  priceRange?: number;
  createdAt?: Timestamp;
  acceptedAt?: Timestamp;
  workerId?: string;
}

@Component({
  selector: 'app-active-bookings',
  templateUrl: './active-bookings.page.html',
  styleUrls: ['./active-bookings.page.scss'],
  standalone: false,
})
export class ActiveBookingsPage implements OnInit, OnDestroy {
  activeBookings: ActiveBooking[] = [];
  userProfile: UserProfile | null = null;
  isLoading: boolean = true;

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Get user profile
    this.subscriptions.push(
      this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
        if (profile?.uid) {
          this.loadActiveBookings();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadActiveBookings() {
    if (!this.userProfile?.uid) return;

    try {
      console.log('Loading active bookings for user:', this.userProfile.uid);
      const bookingsRef = collection(this.firestore, 'bookings');

      // First, try querying with just the workerId to see if we get any results
      const simpleQuery = query(
        bookingsRef,
        where('workerId', '==', this.userProfile.uid)
      );

      // Set up real-time listener
      const unsubscribe = onSnapshot(
        simpleQuery,
        (snapshot) => {
          const allBookings = snapshot.docs.map((doc) => {
            const data = doc.data();
            console.log('Found booking:', {
              id: doc.id,
              status: data['status'],
              workerId: data['workerId'],
            });
            return {
              id: doc.id,
              ...data,
            };
          }) as ActiveBooking[];

          // Filter for active statuses in JavaScript (to avoid Firestore index issues)
          this.activeBookings = allBookings.filter(
            (booking) =>
              booking.status === 'accepted' || booking.status === 'in-progress'
          );

          console.log('All bookings for this worker:', allBookings.length);
          console.log('Active bookings:', this.activeBookings.length);
          console.log('Active bookings data:', this.activeBookings);
          this.isLoading = false;
        },
        (error) => {
          console.error('Error loading active bookings:', error);
          this.showToast('Error loading active bookings', 'danger');
          this.isLoading = false;
        }
      );

      this.subscriptions.push({ unsubscribe } as any);
    } catch (error) {
      console.error('Error setting up active bookings listener:', error);
      this.showToast('Error loading active bookings', 'danger');
      this.isLoading = false;
    }
  }

  viewBookingDetails(booking: ActiveBooking) {
    console.log('Viewing booking details for:', booking.id);
    this.router.navigate(['/pages/worker/booking-details', booking.id]);
  }

  getFormattedDate(timestamp: Timestamp | undefined): string {
    if (!timestamp) return 'Not specified';

    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Invalid date';
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'accepted':
        return 'handy-blue-600';
      case 'in-progress':
        return 'orange-600';
      default:
        return 'gray-600';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'accepted':
        return 'checkmark-circle';
      case 'in-progress':
        return 'time';
      default:
        return 'help-circle';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'accepted':
        return 'Accepted';
      case 'in-progress':
        return 'In Progress';
      default:
        return 'Unknown';
    }
  }

  getBudgetDisplay(booking: ActiveBooking): string {
    if (booking.minBudget && booking.maxBudget) {
      return `₱${booking.minBudget} - ₱${booking.maxBudget}`;
    }
    if (booking.priceRange) {
      return `₱${booking.priceRange}`;
    }
    return 'Budget not specified';
  }

  async showToast(message: string, color: 'success' | 'danger' | 'medium') {
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

  refresh() {
    this.isLoading = true;
    this.loadActiveBookings();
  }
}
