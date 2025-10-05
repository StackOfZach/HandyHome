import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../services/auth.service';
import { BookingService, BookingData } from '../../services/booking.service';

@Component({
  selector: 'app-my-bookings',
  templateUrl: './my-bookings.page.html',
  styleUrls: ['./my-bookings.page.scss'],
  standalone: false,
})
export class MyBookingsPage implements OnInit {
  userProfile: UserProfile | null = null;
  bookings: BookingData[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid) {
        this.loadBookings();
      }
    });
  }

  async loadBookings() {
    if (!this.userProfile?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Fetch real bookings from Firestore
      this.bookings = await this.bookingService.getUserBookings(
        this.userProfile.uid
      );

      if (this.bookings.length === 0) {
        this.error = 'No bookings found. Start by booking a service!';
      }
    } catch (error) {
      console.error('Error loading bookings:', error);
      this.error = 'Failed to load bookings. Please try again.';
      this.showToast('Failed to load bookings', 'danger');
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
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
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
      case 'pending':
        return 'time-outline';
      case 'accepted':
        return 'checkmark-circle-outline';
      case 'on-the-way':
        return 'car-outline';
      case 'in-progress':
        return 'construct-outline';
      case 'completed':
        return 'checkmark-done-outline';
      case 'cancelled':
        return 'close-circle-outline';
      default:
        return 'help-circle-outline';
    }
  }

  async cancelBooking(bookingId: string | undefined) {
    if (!bookingId) {
      this.showToast('Invalid booking ID', 'danger');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking?',
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

              await this.bookingService.cancelBooking(bookingId, data.reason);
              await this.loadBookings(); // Refresh the list
              this.showToast('Booking cancelled successfully', 'success');

              await loading.dismiss();
            } catch (error) {
              console.error('Error cancelling booking:', error);
              this.showToast('Failed to cancel booking', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async trackWorker(booking: BookingData) {
    // TODO: Implement worker tracking functionality with real-time location
    console.log('Track worker for booking:', booking.id);
    this.showToast('Worker tracking feature coming soon!', 'warning');
  }

  async rebookService(booking: BookingData) {
    // Navigate to book service with pre-filled data
    this.router.navigate(['/pages/book-service'], {
      queryParams: {
        category: booking.category,
        rebook: true,
        title: booking.title,
        description: booking.description,
      },
    });
  }
}
